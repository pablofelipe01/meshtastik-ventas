// Modelos de dominio para Mesh Chat.
// Derivados del patrón de la app de referencia, recortados a lo que necesita
// un chat de texto (sin protocolo de portería).

/// Estado de la conexión BLE con el nodo Meshtastic.
enum ConnectionStatus {
  disconnected,
  scanning,
  connecting,
  connected,
  error,
}

/// Estado de entrega de un mensaje propio (ACK de la mesh).
enum DeliveryStatus {
  sending,
  delivered,
  failed,
  none,
}

/// Canal lógico de la conversación con el gateway: IA (Claude) o Familia.
enum GatewayChannel { claude, family }

/// Entrada ya procesada (reensamblada y clasificada) de la conversación con el
/// gateway, lista para pintar en la pestaña Claude o Familia.
class GatewayEntry {
  final String text;
  final bool isMine;
  final DateTime timestamp;
  final DeliveryStatus deliveryStatus;
  final bool pending; // respuesta parcial (aún llegan fragmentos)
  final String? senderName; // para mensajes entrantes de familia ("Nombre: ...")
  final GatewayChannel channel;

  GatewayEntry({
    required this.text,
    required this.isMine,
    required this.timestamp,
    this.deliveryStatus = DeliveryStatus.none,
    this.pending = false,
    this.senderName,
    required this.channel,
  });
}

/// Dispositivo BLE descubierto durante el escaneo.
class ScannedDevice {
  final String name;
  final String address;
  final dynamic rawDevice;

  ScannedDevice({
    required this.name,
    required this.address,
    this.rawDevice,
  });
}

/// Un mensaje de chat (entrante o propio).
class ChatMessage {
  final String id;
  final String messageText;
  final int fromNodeId;
  final String fromNodeName;
  final DateTime timestamp;
  final int channel;
  final int? toNodeId;
  final bool isDirectMessage;
  final bool isMine;
  DeliveryStatus deliveryStatus;

  ChatMessage({
    String? id,
    required this.messageText,
    required this.fromNodeId,
    required this.fromNodeName,
    required this.timestamp,
    required this.channel,
    this.toNodeId,
    required this.isDirectMessage,
    required this.isMine,
    this.deliveryStatus = DeliveryStatus.none,
  }) : id = id ?? '${fromNodeId}_${timestamp.millisecondsSinceEpoch}';

  String get formattedTime {
    final hour = timestamp.hour.toString().padLeft(2, '0');
    final minute = timestamp.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  String get formattedDate {
    final day = timestamp.day.toString().padLeft(2, '0');
    final month = timestamp.month.toString().padLeft(2, '0');
    final year = timestamp.year;
    return '$day/$month/$year';
  }

  bool isSameDay(ChatMessage other) =>
      timestamp.year == other.timestamp.year &&
      timestamp.month == other.timestamp.month &&
      timestamp.day == other.timestamp.day;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ChatMessage &&
          runtimeType == other.runtimeType &&
          id == other.id;

  @override
  int get hashCode => id.hashCode;

  Map<String, dynamic> toJson() => {
        'id': id,
        'messageText': messageText,
        'fromNodeId': fromNodeId,
        'fromNodeName': fromNodeName,
        'timestamp': timestamp.toIso8601String(),
        'channel': channel,
        'toNodeId': toNodeId,
        'isDirectMessage': isDirectMessage,
        'isMine': isMine,
        'deliveryStatus': deliveryStatus.name,
      };

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as String?,
        messageText: json['messageText'] as String,
        fromNodeId: json['fromNodeId'] as int,
        fromNodeName: json['fromNodeName'] as String,
        timestamp: DateTime.parse(json['timestamp'] as String),
        channel: json['channel'] as int,
        toNodeId: json['toNodeId'] as int?,
        isDirectMessage: json['isDirectMessage'] as bool,
        isMine: json['isMine'] as bool,
        deliveryStatus: DeliveryStatus.values.firstWhere(
          (s) => s.name == json['deliveryStatus'],
          orElse: () => DeliveryStatus.none,
        ),
      );
}

/// Un nodo conocido en la mesh.
class MeshNode {
  final int nodeId;
  final String nodeName;
  final bool isOnline;
  final DateTime? lastSeen;
  final int? batteryLevel;
  final double? voltage;

  MeshNode({
    required this.nodeId,
    required this.nodeName,
    this.isOnline = true,
    this.lastSeen,
    this.batteryLevel,
    this.voltage,
  });

  String get displayName =>
      nodeName.isNotEmpty ? nodeName : 'Nodo !${nodeId.toRadixString(16)}';
  String get shortId => '!${nodeId.toRadixString(16)}';
  bool get isUsbPowered => batteryLevel != null && batteryLevel! > 100;

  MeshNode copyWith({
    String? nodeName,
    bool? isOnline,
    DateTime? lastSeen,
    int? batteryLevel,
    double? voltage,
  }) =>
      MeshNode(
        nodeId: nodeId,
        nodeName: nodeName ?? this.nodeName,
        isOnline: isOnline ?? this.isOnline,
        lastSeen: lastSeen ?? this.lastSeen,
        batteryLevel: batteryLevel ?? this.batteryLevel,
        voltage: voltage ?? this.voltage,
      );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MeshNode && nodeId == other.nodeId;

  @override
  int get hashCode => nodeId.hashCode;
}

/// Destino de un mensaje: un canal (broadcast) o un DM a un nodo.
class ChatDestination {
  final String displayName;
  final int? channel;
  final int? nodeId;
  final bool isChannel;

  const ChatDestination({
    required this.displayName,
    this.channel,
    this.nodeId,
    required this.isChannel,
  });

  static const ChatDestination primaryChannel = ChatDestination(
    displayName: 'Canal 0: Primary',
    channel: 0,
    isChannel: true,
  );

  static ChatDestination directMessage(MeshNode node) => ChatDestination(
        displayName: 'DM: ${node.displayName}',
        nodeId: node.nodeId,
        isChannel: false,
      );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ChatDestination &&
          runtimeType == other.runtimeType &&
          channel == other.channel &&
          nodeId == other.nodeId;

  @override
  int get hashCode => Object.hash(channel, nodeId);
}
