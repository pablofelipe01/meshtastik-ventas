import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:meshtastic_flutter/meshtastic_flutter.dart' hide ConnectionStatus;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/chat_models.dart';
import '../models/campo_models.dart';

/// Servicio de chat sobre Meshtastic (BLE).
///
/// Versión ligera: solo transporta texto (chat entre nodos + "@claude"). Toda
/// la lógica pesada vive en el gateway. Reusa el paquete `meshtastic_flutter`.
class MeshtasticService extends ChangeNotifier {
  // ---------- Constantes ----------
  /// Payload útil máximo por paquete Meshtastic.
  static const int _maxMessageBytes = 200;

  /// Nodo del gateway por defecto (Central, Wio Tracker L1 en pi4-meshportatil-show): !40883c41.
  static const int defaultGatewayNodeId = 0x40883c41; // 1082670145

  static const int _broadcastNum = 0xFFFFFFFF;

  // Claves de shared_preferences.
  static const _savedDeviceAddressKey = 'saved_device_address';
  static const _savedDeviceNameKey = 'saved_device_name';
  static const _gatewayNodeIdKey = 'gateway_node_id';

  // ---------- Estado de conexión ----------
  MeshtasticClient? _client;
  ConnectionStatus _status = ConnectionStatus.disconnected;
  String _statusMessage = 'Desconectado';
  StreamSubscription? _connectionSubscription;
  StreamSubscription? _packetSubscription;
  String? _connectedDeviceName;
  String? _connectedDeviceMac;

  // Auto-reconexión + keepalive.
  bool _autoReconnectEnabled = false;
  bool _isReconnecting = false;
  static const _maxReconnectAttempts = 10;
  static const _reconnectDelay = Duration(seconds: 2);
  Timer? _keepaliveTimer;
  static const _keepaliveInterval = Duration(seconds: 15);

  // ---------- Datos ----------
  final Map<int, MeshNode> _knownNodes = {};
  final List<ChatMessage> _messageHistory = [];
  final StreamController<ChatMessage> _messageController =
      StreamController<ChatMessage>.broadcast();
  final Set<int> _processedPacketIds = {};

  // No-leídos.
  int _unreadChatCount = 0;
  final Set<int> _nodesWithUnread = {};
  final Set<int> _channelsWithUnread = {};

  // Entrega (ACK) de DMs propios pendientes: nodeId -> cola de mensajes.
  final Map<int, List<ChatMessage>> _pendingDeliveries = {};

  int? _selectedGatewayNodeId;

  MeshtasticService() {
    _loadSavedGatewayNodeId();
    _loadCampoState();
  }

  // ---------- Getters públicos ----------
  ConnectionStatus get status => _status;
  String get statusMessage => _statusMessage;
  bool get isConnected => _status == ConnectionStatus.connected;
  String? get connectedDeviceName => _connectedDeviceName;
  String? get connectedDeviceMac => _connectedDeviceMac;
  int? get myNodeNum => _client?.myNodeInfo?.myNodeNum;

  List<ChatMessage> get messageHistory => List.unmodifiable(_messageHistory);
  Stream<ChatMessage> get messageStream => _messageController.stream;

  int get currentGatewayNodeId => _selectedGatewayNodeId ?? defaultGatewayNodeId;
  MeshNode? get currentGatewayNode => _knownNodes[currentGatewayNodeId];

  int get unreadChatCount => _unreadChatCount;
  bool hasUnreadFromNode(int nodeId) => _nodesWithUnread.contains(nodeId);
  bool hasUnreadOnChannel(int channel) => _channelsWithUnread.contains(channel);

  /// Nodos conocidos (excluye el propio), ordenados por nombre.
  List<MeshNode> get onlineNodes {
    final mine = myNodeNum;
    final list = _knownNodes.values.where((n) => n.nodeId != mine).toList();
    list.sort((a, b) => a.displayName.compareTo(b.displayName));
    return list;
  }

  // ---------- Límites de mensaje (estáticos) ----------
  static int getUtf8ByteLength(String text) => utf8.encode(text).length;
  static bool isMessageTooLong(String text) =>
      getUtf8ByteLength(text) > _maxMessageBytes;
  static int get maxMessageBytes => _maxMessageBytes;

  // ---------- Persistencia ----------
  Future<void> _loadSavedGatewayNodeId() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getInt(_gatewayNodeIdKey);
    if (saved != null) {
      _selectedGatewayNodeId = saved;
      notifyListeners();
    }
  }

  Future<void> saveGatewayNodeId(int nodeId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_gatewayNodeIdKey, nodeId);
    _selectedGatewayNodeId = nodeId;
    notifyListeners();
  }

  Future<String?> getSavedDeviceAddress() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_savedDeviceAddressKey);
  }

  Future<String?> getSavedDeviceName() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_savedDeviceNameKey);
  }

  Future<void> _saveDeviceInfo(String address, String name) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_savedDeviceAddressKey, address);
    await prefs.setString(_savedDeviceNameKey, name);
  }

  Future<void> clearSavedDevice() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_savedDeviceAddressKey);
    await prefs.remove(_savedDeviceNameKey);
  }

  // ---------- Conexión ----------
  Future<void> _ensureClientInitialized() async {
    if (_client == null) {
      _client = MeshtasticClient();
      await _client!.initialize();
    }
  }

  Stream<ScannedDevice> scanDevices() async* {
    _updateStatus(ConnectionStatus.scanning, 'Escaneando...');
    await _ensureClientInitialized();
    await for (final device in _client!.scanForDevices()) {
      yield ScannedDevice(
        name: device.platformName,
        address: device.remoteId.toString(),
        rawDevice: device,
      );
    }
    if (_status == ConnectionStatus.scanning) {
      _updateStatus(ConnectionStatus.disconnected, 'Escaneo terminado');
    }
  }

  void _wireStreams() {
    _connectionSubscription?.cancel();
    _packetSubscription?.cancel();
    _connectionSubscription = _client!.connectionStream.listen((status) {
      switch (status.state) {
        case MeshtasticConnectionState.connected:
          _updateStatus(ConnectionStatus.connected, 'Conectado');
          _autoReconnectEnabled = true;
          _isReconnecting = false;
          _startKeepalive();
          break;
        case MeshtasticConnectionState.connecting:
        case MeshtasticConnectionState.configuring:
          _updateStatus(ConnectionStatus.connecting, 'Conectando...');
          break;
        case MeshtasticConnectionState.disconnected:
          _onUnexpectedDisconnect();
          break;
        case MeshtasticConnectionState.error:
          _updateStatus(ConnectionStatus.error, 'Error de conexión');
          _onUnexpectedDisconnect();
          break;
      }
    });
    _packetSubscription = _client!.packetStream.listen(
      _handlePacket,
      onError: (e) => debugPrint('❌ [MESH] packetStream: $e'),
    );
  }

  Future<void> connectToDevice(ScannedDevice device) async {
    _updateStatus(ConnectionStatus.connecting, 'Conectando...');
    await _ensureClientInitialized();
    _wireStreams();
    try {
      await _client!.connectToDevice(device.rawDevice);
      _connectedDeviceName = device.name;
      _connectedDeviceMac = device.address;
      await _saveDeviceInfo(device.address, device.name);
    } catch (e) {
      _updateStatus(ConnectionStatus.error, 'No se pudo conectar: $e');
    }
  }

  Future<void> connectToDeviceByAddress(String address) async {
    _updateStatus(ConnectionStatus.connecting, 'Conectando...');
    await _ensureClientInitialized();
    _wireStreams();
    try {
      await _client!.connectById(address);
      _connectedDeviceMac = address;
      _connectedDeviceName ??= await getSavedDeviceName();
    } catch (e) {
      _updateStatus(ConnectionStatus.error, 'No se pudo reconectar: $e');
      _onUnexpectedDisconnect();
    }
  }

  Future<void> connectToSavedDevice() async {
    final address = await getSavedDeviceAddress();
    if (address == null) return;
    _connectedDeviceName = await getSavedDeviceName();
    await connectToDeviceByAddress(address);
  }

  void _onUnexpectedDisconnect() {
    _stopKeepalive();
    if (_status != ConnectionStatus.connected &&
        _status != ConnectionStatus.error) {
      _updateStatus(ConnectionStatus.disconnected, 'Desconectado');
    } else {
      _updateStatus(ConnectionStatus.disconnected, 'Conexión perdida');
    }
    if (_autoReconnectEnabled && !_isReconnecting) {
      _attemptReconnect();
    }
  }

  Future<void> _attemptReconnect() async {
    _isReconnecting = true;
    final address = await getSavedDeviceAddress();
    if (address == null) {
      _isReconnecting = false;
      return;
    }
    for (var attempt = 1;
        attempt <= _maxReconnectAttempts && _autoReconnectEnabled;
        attempt++) {
      _updateStatus(ConnectionStatus.connecting,
          'Reconectando ($attempt/$_maxReconnectAttempts)...');
      await Future.delayed(_reconnectDelay);
      try {
        _wireStreams();
        await _client!.connectById(address);
        _isReconnecting = false;
        return;
      } catch (_) {
        // sigue intentando
      }
    }
    _isReconnecting = false;
    _updateStatus(ConnectionStatus.disconnected, 'No se pudo reconectar');
  }

  void _startKeepalive() {
    _stopKeepalive();
    _keepaliveTimer = Timer.periodic(_keepaliveInterval, (_) async {
      try {
        await _client?.keepAlive();
      } catch (_) {}
    });
  }

  void _stopKeepalive() {
    _keepaliveTimer?.cancel();
    _keepaliveTimer = null;
  }

  Future<void> disconnect() async {
    _autoReconnectEnabled = false;
    _stopKeepalive();
    await _connectionSubscription?.cancel();
    await _packetSubscription?.cancel();
    try {
      await _client?.disconnect();
    } catch (_) {}
    _updateStatus(ConnectionStatus.disconnected, 'Desconectado');
  }

  Future<void> disconnectAndClear() async {
    await disconnect();
    await clearSavedDevice();
  }

  // ---------- Envío ----------
  Future<bool> sendChatMessage(
    String text, {
    int? channel,
    int? destinationId,
  }) async {
    if (!isConnected || _client == null) return false;
    try {
      if (destinationId != null) {
        await _client!.sendTextMessage(text, destinationId: destinationId);
      } else {
        await _client!.sendTextMessage(text, channel: channel ?? 0);
      }

      final isDM = destinationId != null;
      final msg = ChatMessage(
        messageText: text,
        fromNodeId: myNodeNum ?? 0,
        fromNodeName: 'Yo',
        timestamp: DateTime.now(),
        channel: channel ?? 0,
        toNodeId: destinationId,
        isDirectMessage: isDM,
        isMine: true,
        deliveryStatus: isDM ? DeliveryStatus.sending : DeliveryStatus.none,
      );
      _addMessageToHistory(msg);
      _messageController.add(msg);

      if (isDM) {
        _pendingDeliveries.putIfAbsent(destinationId, () => []).add(msg);
        _scheduleDeliveryTimeout(destinationId, msg);
      }
      notifyListeners();
      return true;
    } catch (e) {
      debugPrint('❌ [MESH] Error enviando: $e');
      return false;
    }
  }

  void _scheduleDeliveryTimeout(int nodeId, ChatMessage msg) {
    Future.delayed(const Duration(seconds: 45), () {
      if (msg.deliveryStatus == DeliveryStatus.sending) {
        msg.deliveryStatus = DeliveryStatus.failed;
        _pendingDeliveries[nodeId]?.remove(msg);
        notifyListeners();
      }
    });
  }

  // ---------- Recepción ----------
  void _handlePacket(MeshPacketWrapper packet) {
    try {
      // Dedupe por id de paquete.
      final id = packet.id;
      if (id != 0) {
        if (_processedPacketIds.contains(id)) return;
        _processedPacketIds.add(id);
        if (_processedPacketIds.length > 500) {
          _processedPacketIds.clear();
          _processedPacketIds.add(id);
        }
      }

      final fromNodeId = packet.from;
      final toNodeId = packet.to;
      final channel = packet.channel;
      final isDM = toNodeId != _broadcastNum && toNodeId != 0;

      // Actualiza el catálogo de nodos con cualquier tráfico.
      _updateKnownNode(fromNodeId);

      if (packet.isRouting) {
        _handleRoutingPacket(packet);
        return;
      }

      if (!packet.isTextMessage) return;

      String? text;
      final decoded = packet.decoded;
      if (decoded != null) {
        try {
          text = utf8.decode(decoded.payload, allowMalformed: true);
        } catch (_) {
          text = packet.textMessage;
        }
      } else {
        text = packet.textMessage;
      }
      if (text == null || text.isEmpty) return;

      final fromName = _getNodeName(fromNodeId);
      final chatMessage = ChatMessage(
        messageText: text,
        fromNodeId: fromNodeId,
        fromNodeName: fromName,
        timestamp: DateTime.now(),
        channel: channel,
        toNodeId: toNodeId,
        isDirectMessage: isDM,
        isMine: false,
      );
      _addMessageToHistory(chatMessage);
      _unreadChatCount++;
      if (isDM) {
        _nodesWithUnread.add(fromNodeId);
      } else {
        _channelsWithUnread.add(channel);
      }
      _messageController.add(chatMessage);
      notifyListeners();
    } catch (e) {
      debugPrint('❌ [MESH] _handlePacket: $e');
    }
  }

  void _handleRoutingPacket(MeshPacketWrapper packet) {
    try {
      final decoded = packet.decoded;
      if (decoded == null) return;
      final routing = Routing.fromBuffer(decoded.payload);
      final ok = routing.errorReason == Routing_Error.NONE;
      _updateDeliveryStatus(
          packet.from, ok ? DeliveryStatus.delivered : DeliveryStatus.failed);
    } catch (_) {}
  }

  void _updateDeliveryStatus(int nodeId, DeliveryStatus status) {
    final queue = _pendingDeliveries[nodeId];
    if (queue == null || queue.isEmpty) return;
    final msg = queue.removeAt(0);
    msg.deliveryStatus = status;
    notifyListeners();
  }

  // ---------- Nodos ----------
  void _updateKnownNode(int nodeId) {
    final info = _client?.nodes[nodeId];
    final name = _getNodeName(nodeId);
    _knownNodes[nodeId] = MeshNode(
      nodeId: nodeId,
      nodeName: name,
      isOnline: true,
      lastSeen: DateTime.now(),
      batteryLevel: info?.batteryLevel,
      voltage: info?.voltage,
    );
  }

  String _getNodeName(int nodeId) {
    final info = _client?.nodes[nodeId];
    final longName = info?.longName;
    if (longName != null && longName.isNotEmpty) return longName;
    final shortName = info?.shortName;
    if (shortName != null && shortName.isNotEmpty) return shortName;
    return '!${nodeId.toRadixString(16)}';
  }

  // ---------- Historial y filtrado ----------
  void _addMessageToHistory(ChatMessage msg) {
    _messageHistory.add(msg);
    if (_messageHistory.length > 1000) {
      _messageHistory.removeRange(0, _messageHistory.length - 1000);
    }
  }

  List<ChatMessage> getMessagesForDestination(ChatDestination destination) {
    if (destination.isChannel) {
      return _messageHistory
          .where((m) => !m.isDirectMessage && m.channel == destination.channel)
          .toList();
    }
    final nodeId = destination.nodeId;
    final mine = myNodeNum;
    return _messageHistory.where((m) {
      if (!m.isDirectMessage) return false;
      // Conversación con ese nodo: mensajes de él, o míos hacia él.
      if (m.isMine) return m.toNodeId == nodeId;
      return m.fromNodeId == nodeId ||
          (m.toNodeId == nodeId && m.fromNodeId == mine);
    }).toList();
  }

  /// Todos los mensajes DM entre yo y el nodo del gateway. Incluye mis
  /// "@claude ..." y mensajes a familia, y las respuestas del gateway.
  List<ChatMessage> getGatewayConversation() {
    final gw = currentGatewayNodeId;
    return _messageHistory.where((m) {
      if (!m.isDirectMessage) return false;
      if (m.isMine) return m.toNodeId == gw;
      return m.fromNodeId == gw;
    }).toList();
  }

  // ---------- Correo (libreta + envío por @claude/@mail) ----------
  final Map<String, String> _emailContacts = {}; // alias -> nombre
  String? _lastEmailResult; // texto legible del último envío
  bool _lastEmailOk = false;
  DateTime? _lastEmailAt; // cuándo llegó la última respuesta MAIL|

  String? get lastEmailResult => _lastEmailResult;
  bool get lastEmailOk => _lastEmailOk;
  DateTime? get lastEmailAt => _lastEmailAt;

  /// Pide al gateway la libreta de correos de este nodo (alias→nombre).
  Future<bool> requestEmailContacts() =>
      sendChatMessage('@correos', destinationId: currentGatewayNodeId);

  /// Envía un correo por el gateway. `dest` es un alias de la libreta o un email
  /// completo. Formato de mesh: `@mail|dest|asunto|cuerpo`.
  Future<bool> sendEmail(String dest, String subject, String body) =>
      sendChatMessage('@mail|$dest|$subject|$body',
          destinationId: currentGatewayNodeId);

  /// Libreta de correos conocida (alias, nombre), ordenada por nombre.
  List<MapEntry<String, String>> emailContactList() {
    parseGatewayEntries(); // efecto secundario: puebla _emailContacts
    final list = _emailContacts.entries.toList()
      ..sort((a, b) => a.value.toLowerCase().compareTo(b.value.toLowerCase()));
    return list;
  }

  void _parseEmailList(String s) {
    // "EMAILS|alias:Nombre|alias:Nombre"
    _emailContacts.clear();
    final parts = s.split('|');
    for (var i = 1; i < parts.length; i++) {
      final p = parts[i];
      if (p.isEmpty) continue;
      final c = p.indexOf(':');
      if (c <= 0) continue;
      final alias = p.substring(0, c).trim();
      final name = p.substring(c + 1).trim();
      if (alias.isNotEmpty) _emailContacts[alias] = name.isEmpty ? alias : name;
    }
  }

  void _parseMailResult(String s, DateTime ts) {
    // "MAIL|ok|texto"  o  "MAIL|err|texto"
    final parts = s.split('|');
    if (parts.length < 3) return;
    _lastEmailOk = parts[1].trim().toLowerCase() == 'ok';
    _lastEmailResult = parts.sublist(2).join('|').trim();
    // Usa la marca de tiempo del mensaje (estable entre reparseos → idempotente).
    _lastEmailAt = ts;
  }

  // ---------- Contactos (mensajería dirigida con la familia) ----------
  final Map<int, String> _contacts = {}; // contactId -> nombre

  static final RegExp _fragRe = RegExp(r'^\[(\d+)/(\d+)\]\s*');
  static final RegExp _claudeRe = RegExp(r'^Claude:\s*');
  static final RegExp _atClaudeRe =
      RegExp(r'^\s*@claude\s*', caseSensitive: false);
  static final RegExp _senderRe = RegExp(r'^([^:]{1,40}):\s+(.*)$', dotAll: true);
  // Salida propia: "@fam|<id>|<texto>"
  static final RegExp _famOutRe =
      RegExp(r'^@fam\|(\d+)\|(.*)$', caseSensitive: false, dotAll: true);
  // Entrada del gateway: "FAM|<id>|<nombre>|<texto>"
  static final RegExp _famInRe =
      RegExp(r'^FAM\|(\d+)\|([^|]*)\|(.*)$', dotAll: true);

  /// Pide al gateway la lista de contactos (familiares) de este nodo.
  Future<bool> requestContacts() =>
      sendChatMessage('@contactos', destinationId: currentGatewayNodeId);

  /// Envía un mensaje dirigido a un familiar (formato `@fam|ID|texto`).
  Future<bool> sendToContact(int contactId, String text) =>
      sendChatMessage('@fam|$contactId|$text',
          destinationId: currentGatewayNodeId);

  /// Lista de contactos (id, nombre) conocida: la que envió el gateway más
  /// cualquier contacto visto en mensajes. Ordenada por nombre.
  List<MapEntry<int, String>> familyContactList() {
    final entries = parseGatewayEntries(); // puebla _contacts
    final map = <int, String>{..._contacts};
    for (final e in entries) {
      if (e.channel == GatewayChannel.family && e.contactId != null) {
        map.putIfAbsent(
            e.contactId!, () => e.senderName ?? 'Contacto ${e.contactId}');
      }
    }
    final list = map.entries.toList()
      ..sort((a, b) => a.value.toLowerCase().compareTo(b.value.toLowerCase()));
    return list;
  }

  /// Mensajes dirigidos con un familiar específico.
  List<GatewayEntry> contactMessages(int contactId) => parseGatewayEntries()
      .where((e) =>
          e.channel == GatewayChannel.family && e.contactId == contactId)
      .toList();

  void _parseContactList(String s) {
    // "CONTACTOS|1:Mamá|2:Papá"
    final parts = s.split('|');
    for (var i = 1; i < parts.length; i++) {
      final p = parts[i];
      if (p.isEmpty) continue;
      final c = p.indexOf(':');
      if (c <= 0) continue;
      final id = int.tryParse(p.substring(0, c));
      final name = p.substring(c + 1).trim();
      if (id != null && name.isNotEmpty) _contacts[id] = name;
    }
  }

  /// Procesa la conversación con el gateway: reensambla los fragmentos `[i/n]`
  /// y clasifica cada mensaje (Claude / Familia dirigida). Actualiza el mapa de
  /// contactos como efecto secundario al ver un mensaje CONTACTOS.
  List<GatewayEntry> parseGatewayEntries() {
    final raw = getGatewayConversation();
    final entries = <GatewayEntry>[];
    final buf = <String>[];
    int? expectedTotal;
    DateTime? bufTime;

    void flush() {
      if (buf.isEmpty) return;
      final combined = buf.join(' ').trim();
      final pending = expectedTotal != null && buf.length < expectedTotal!;
      final e = _classifyIncoming(combined, bufTime ?? DateTime.now(), pending);
      if (e != null) entries.add(e);
      buf.clear();
      expectedTotal = null;
      bufTime = null;
    }

    for (final m in raw) {
      if (m.isMine) {
        flush();
        final t0 = m.messageText.trim();
        final low = t0.toLowerCase();
        if (low.startsWith('@claude')) {
          final t = m.messageText.replaceFirst(_atClaudeRe, '');
          entries.add(GatewayEntry(
            text: t.isEmpty ? '(vacío)' : t,
            isMine: true,
            timestamp: m.timestamp,
            deliveryStatus: m.deliveryStatus,
            channel: GatewayChannel.claude,
          ));
        } else if (low == '@contactos' ||
            low == '@correos' ||
            low.startsWith('@mail|')) {
          // comando, no se muestra en el chat
        } else {
          final fo = _famOutRe.firstMatch(t0);
          entries.add(GatewayEntry(
            text: fo != null ? fo.group(2)! : m.messageText,
            isMine: true,
            timestamp: m.timestamp,
            deliveryStatus: m.deliveryStatus,
            contactId: fo != null ? int.tryParse(fo.group(1)!) : null,
            channel: GatewayChannel.family,
          ));
        }
        continue;
      }
      final match = _fragRe.firstMatch(m.messageText);
      if (match == null) {
        flush();
        final e = _classifyIncoming(m.messageText, m.timestamp, false);
        if (e != null) entries.add(e);
      } else {
        final idx = int.parse(match.group(1)!);
        final total = int.parse(match.group(2)!);
        if (idx == 1) flush();
        expectedTotal = total;
        bufTime ??= m.timestamp;
        buf.add(m.messageText.substring(match.end));
        if (buf.length >= total) flush();
      }
    }
    flush();
    return entries;
  }

  /// Clasifica un mensaje entrante del gateway. Devuelve null si no es de chat
  /// (p.ej. CONTACTOS, que solo actualiza el mapa de contactos).
  GatewayEntry? _classifyIncoming(String combined, DateTime ts, bool pending) {
    if (_claudeRe.hasMatch(combined)) {
      return GatewayEntry(
        text: combined.replaceFirst(_claudeRe, ''),
        isMine: false,
        timestamp: ts,
        pending: pending,
        channel: GatewayChannel.claude,
      );
    }
    if (combined.startsWith('CONTACTOS|')) {
      _parseContactList(combined);
      return null;
    }
    if (combined.startsWith('EMAILS|')) {
      _parseEmailList(combined);
      return null;
    }
    if (combined.startsWith('MAIL|')) {
      _parseMailResult(combined, ts);
      return null;
    }
    // Catálogo y acuses de Campo: son protocolo, no conversación.
    if (combined.startsWith('AGCAT|')) {
      _parseAgcat(combined);
      return null;
    }
    if (combined.startsWith('AGPLG|')) {
      _parseAgplg(combined);
      return null;
    }
    if (combined.startsWith('✓') || combined.startsWith('✗')) {
      _parseCampoAck(combined, ts);
      return null;
    }
    final fi = _famInRe.firstMatch(combined);
    if (fi != null) {
      final id = int.tryParse(fi.group(1)!);
      final name = fi.group(2)!.trim();
      if (id != null && name.isNotEmpty) _contacts[id] = name;
      return GatewayEntry(
        text: fi.group(3)!,
        isMine: false,
        timestamp: ts,
        pending: pending,
        senderName: name.isEmpty ? null : name,
        contactId: id,
        channel: GatewayChannel.family,
      );
    }
    final fm = _senderRe.firstMatch(combined);
    if (fm != null) {
      return GatewayEntry(
        text: fm.group(2)!,
        isMine: false,
        timestamp: ts,
        pending: pending,
        senderName: fm.group(1)!.trim(),
        channel: GatewayChannel.family,
      );
    }
    return GatewayEntry(
      text: combined,
      isMine: false,
      timestamp: ts,
      pending: pending,
      channel: GatewayChannel.family,
    );
  }

  // ---------- Campo (captura agroindustrial) ----------
  // El catálogo llega por la mesh y se cachea en el teléfono: la app nunca
  // necesita internet. Las capturas se encolan y se reintentan, así que estar
  // fuera del alcance de la malla no pierde ningún dato.
  static const _campoCatalogKey = 'campo_catalogo';
  static const _campoQueueKey = 'campo_pendientes';

  CampoCatalogo? _campoCatalogo;
  Map<String, String> _campoPlagas = {};
  final List<CampoPendiente> _campoPendientes = [];
  CampoResultado? _campoResultado;

  CampoCatalogo? get campoCatalogo => _campoCatalogo;
  int get campoPendientesCount => _campoPendientes.length;
  CampoResultado? get campoResultado => _campoResultado;

  Future<void> _loadCampoState() async {
    final prefs = await SharedPreferences.getInstance();
    final cat = prefs.getString(_campoCatalogKey);
    if (cat != null) {
      try {
        _campoCatalogo =
            CampoCatalogo.fromJson(jsonDecode(cat) as Map<String, dynamic>);
        _campoPlagas = Map<String, String>.from(_campoCatalogo!.plagas);
      } catch (_) {}
    }
    final q = prefs.getStringList(_campoQueueKey);
    if (q != null) {
      for (final s in q) {
        try {
          _campoPendientes
              .add(CampoPendiente.fromJson(jsonDecode(s) as Map<String, dynamic>));
        } catch (_) {}
      }
    }
    if (_campoCatalogo != null || _campoPendientes.isNotEmpty) notifyListeners();
  }

  Future<void> _saveCampoCatalog() async {
    if (_campoCatalogo == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_campoCatalogKey, jsonEncode(_campoCatalogo!.toJson()));
  }

  Future<void> _saveCampoQueue() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_campoQueueKey,
        [for (final p in _campoPendientes) jsonEncode(p.toJson())]);
  }

  /// Pide al gateway el catálogo de lotes y parcelas de la finca de este nodo.
  Future<bool> requestCampoCatalog() =>
      sendChatMessage('@agcat', destinationId: currentGatewayNodeId);

  /// Encola una captura y trata de enviarla en el acto.
  ///
  /// `trama` va SIN la marca de hora: se añade al enviar, para que el gateway
  /// sepa cuándo se capturó de verdad aunque salga horas después.
  Future<void> capturarCampo(String trama) async {
    _campoPendientes
        .add(CampoPendiente(trama: trama, capturada: DateTime.now()));
    await _saveCampoQueue();
    notifyListeners();
    await flushCampoQueue();
  }

  /// Reintenta la cola. Se detiene al primer fallo y conserva el resto.
  Future<void> flushCampoQueue() async {
    if (!isConnected) return;
    while (_campoPendientes.isNotEmpty) {
      final p = _campoPendientes.first;
      final ok = await sendChatMessage(p.tramaConHora,
          destinationId: currentGatewayNodeId);
      if (!ok) break;
      _campoPendientes.removeAt(0);
      await _saveCampoQueue();
      notifyListeners();
    }
  }

  void _parseAgcat(String s) {
    final cat = CampoCatalogo.parseAgcat(s, _campoPlagas);
    if (cat == null) return;
    _campoCatalogo = cat;
    _saveCampoCatalog();
  }

  void _parseAgplg(String s) {
    _campoPlagas = CampoCatalogo.parseAgplg(s);
    final c = _campoCatalogo;
    if (c != null) {
      // El catálogo pudo llegar antes que las plagas: recomponerlo.
      _campoCatalogo = CampoCatalogo(
        fincaCodigo: c.fincaCodigo,
        fincaNombre: c.fincaNombre,
        lotes: c.lotes,
        plagas: _campoPlagas,
      );
      _saveCampoCatalog();
    }
  }

  void _parseCampoAck(String s, DateTime ts) {
    _campoResultado = CampoResultado(
      ok: s.startsWith('✓'),
      texto: s.substring(1).trim(),
      cuando: ts,
    );
  }

  // ---------- No-leídos ----------
  void clearUnreadChat() {
    _unreadChatCount = 0;
    notifyListeners();
  }

  void clearUnreadForDestination(ChatDestination destination) {
    if (destination.isChannel) {
      _channelsWithUnread.remove(destination.channel);
    } else {
      _nodesWithUnread.remove(destination.nodeId);
    }
    notifyListeners();
  }

  void clearUnreadFromNode(int nodeId) {
    _nodesWithUnread.remove(nodeId);
    notifyListeners();
  }

  // ---------- Utilidades ----------
  void _updateStatus(ConnectionStatus status, String message) {
    final reconectado =
        status == ConnectionStatus.connected && _status != status;
    _status = status;
    _statusMessage = message;
    notifyListeners();
    // Al recuperar la malla, sacar lo que quedó encolado sin cobertura.
    if (reconectado && _campoPendientes.isNotEmpty) {
      unawaited(flushCampoQueue());
    }
  }

  @override
  void dispose() {
    _stopKeepalive();
    _connectionSubscription?.cancel();
    _packetSubscription?.cancel();
    _messageController.close();
    _client?.disconnect();
    super.dispose();
  }
}
