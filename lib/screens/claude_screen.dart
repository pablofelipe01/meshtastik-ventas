import 'dart:async';
import 'package:flutter/material.dart';

import '../models/chat_models.dart';
import '../services/meshtastic_service.dart';
import '../widgets/delivery_indicator.dart';

/// Conversación dedicada con Claude vía el gateway.
///
/// El usuario escribe normal; la app envía `@claude <texto>` como DM al nodo
/// del gateway. Las respuestas del gateway (que llegan por DM, posiblemente
/// fragmentadas como `[i/n] Claude: ...`) se reensamblan y se muestran limpias.
class ClaudeScreen extends StatefulWidget {
  final MeshtasticService meshtasticService;

  const ClaudeScreen({super.key, required this.meshtasticService});

  @override
  State<ClaudeScreen> createState() => _ClaudeScreenState();
}

/// Entrada de la conversación lista para pintar (ya reensamblada / limpia).
class _ClaudeEntry {
  final String text;
  final bool isMine;
  final DateTime timestamp;
  final DeliveryStatus deliveryStatus;
  final bool pending; // respuesta parcial (aún llegan fragmentos)

  _ClaudeEntry({
    required this.text,
    required this.isMine,
    required this.timestamp,
    this.deliveryStatus = DeliveryStatus.none,
    this.pending = false,
  });
}

class _ClaudeScreenState extends State<ClaudeScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  StreamSubscription<ChatMessage>? _sub;
  bool _isSending = false;

  MeshtasticService get _service => widget.meshtasticService;

  @override
  void initState() {
    super.initState();
    _service.addListener(_onChange);
    _sub = _service.messageStream.listen((_) => _scrollToBottom());
    _scrollToBottom();
  }

  @override
  void dispose() {
    _service.removeListener(_onChange);
    _sub?.cancel();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onChange() {
    if (mounted) setState(() {});
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final q = _controller.text.trim();
    if (q.isEmpty || !_service.isConnected) return;
    setState(() => _isSending = true);
    final ok = await _service.sendChatMessage(
      '@claude $q',
      destinationId: _service.currentGatewayNodeId,
    );
    setState(() => _isSending = false);
    if (ok) {
      _controller.clear();
      _scrollToBottom();
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo enviar a Claude')),
      );
    }
  }

  /// Convierte los mensajes DM crudos con el gateway en entradas limpias,
  /// reensamblando los fragmentos `[i/n] ...` de las respuestas.
  List<_ClaudeEntry> _buildEntries() {
    final raw = _service.getGatewayConversation();
    final entries = <_ClaudeEntry>[];

    final fragRe = RegExp(r'^\[(\d+)/(\d+)\]\s*');
    // buffer de fragmentos en curso
    final buf = <String>[];
    int? expectedTotal;
    DateTime? bufTime;

    void flushBuffer() {
      if (buf.isEmpty) return;
      var combined = buf.join(' ').trim();
      combined = combined.replaceFirst(RegExp(r'^Claude:\s*'), '');
      entries.add(_ClaudeEntry(
        text: combined,
        isMine: false,
        timestamp: bufTime ?? DateTime.now(),
        pending: expectedTotal != null && buf.length < expectedTotal!,
      ));
      buf.clear();
      expectedTotal = null;
      bufTime = null;
    }

    for (final m in raw) {
      if (m.isMine) {
        flushBuffer();
        var t = m.messageText.replaceFirst(RegExp(r'^@claude\s*', caseSensitive: false), '');
        entries.add(_ClaudeEntry(
          text: t.isEmpty ? '(vacío)' : t,
          isMine: true,
          timestamp: m.timestamp,
          deliveryStatus: m.deliveryStatus,
        ));
        continue;
      }

      // Mensaje entrante del gateway.
      final match = fragRe.firstMatch(m.messageText);
      if (match == null) {
        // Respuesta de un solo paquete.
        flushBuffer();
        var t = m.messageText.replaceFirst(RegExp(r'^Claude:\s*'), '');
        entries.add(_ClaudeEntry(
          text: t,
          isMine: false,
          timestamp: m.timestamp,
        ));
      } else {
        final idx = int.parse(match.group(1)!);
        final total = int.parse(match.group(2)!);
        if (idx == 1) flushBuffer(); // empieza una respuesta nueva
        expectedTotal = total;
        bufTime ??= m.timestamp;
        buf.add(m.messageText.substring(match.end));
        if (buf.length >= total) flushBuffer();
      }
    }
    flushBuffer();
    return entries;
  }

  Widget _buildBubble(_ClaudeEntry e) {
    final align = e.isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start;
    final color = e.isMine
        ? Colors.blue.shade100
        : Theme.of(context).colorScheme.surfaceContainerHighest;
    return Container(
      margin: EdgeInsets.only(
        left: e.isMine ? 48 : 8,
        right: e.isMine ? 8 : 48,
        top: 4,
        bottom: 4,
      ),
      child: Column(
        crossAxisAlignment: align,
        children: [
          if (!e.isMine)
            const Padding(
              padding: EdgeInsets.only(left: 10, bottom: 2),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.smart_toy, size: 14, color: Colors.blueGrey),
                  SizedBox(width: 4),
                  Text('Claude',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.blueGrey)),
                ],
              ),
            ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: align,
              children: [
                Text(e.text, style: const TextStyle(fontSize: 15)),
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (e.pending)
                      const Padding(
                        padding: EdgeInsets.only(right: 6),
                        child: SizedBox(
                          width: 10,
                          height: 10,
                          child: CircularProgressIndicator(strokeWidth: 1.5),
                        ),
                      ),
                    Text(
                      '${e.timestamp.hour.toString().padLeft(2, '0')}:${e.timestamp.minute.toString().padLeft(2, '0')}',
                      style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                    ),
                    if (e.isMine)
                      Padding(
                        padding: const EdgeInsets.only(left: 4),
                        child: DeliveryIndicator(status: e.deliveryStatus),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.smart_toy_outlined, size: 64, color: Colors.blueGrey),
            const SizedBox(height: 16),
            Text('Pregúntale a Claude',
                style: TextStyle(fontSize: 18, color: Colors.grey.shade700)),
            const SizedBox(height: 8),
            Text(
              'Escribe cualquier pregunta. Va por la red mesh al gateway, '
              'que consulta a Claude y responde aquí. No necesitas internet '
              'en el teléfono.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade500),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final entries = _buildEntries();
    final maxBytes = MeshtasticService.maxMessageBytes;
    final bytes = MeshtasticService.getUtf8ByteLength('@claude ${_controller.text}');
    final tooLong = bytes > maxBytes;
    final canSend = _service.isConnected && !_isSending && !tooLong;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: const Row(
          children: [
            Icon(Icons.smart_toy),
            SizedBox(width: 8),
            Text('Claude'),
          ],
        ),
        bottom: _service.isConnected
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(24),
                child: Container(
                  width: double.infinity,
                  color: Colors.orange.shade100,
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Text(
                    _service.statusMessage,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: Colors.orange.shade900),
                  ),
                ),
              ),
      ),
      body: Column(
        children: [
          Expanded(
            child: entries.isEmpty
                ? _buildEmpty()
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: entries.length,
                    itemBuilder: (context, i) => _buildBubble(entries[i]),
                  ),
          ),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              boxShadow: [
                BoxShadow(
                    color: Colors.grey.shade300,
                    blurRadius: 4,
                    offset: const Offset(0, -2)),
              ],
            ),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      onChanged: (_) => setState(() {}),
                      textInputAction: TextInputAction.send,
                      onSubmitted: canSend ? (_) => _send() : null,
                      enabled: _service.isConnected,
                      minLines: 1,
                      maxLines: 4,
                      decoration: InputDecoration(
                        hintText: 'Pregúntale a Claude…',
                        filled: true,
                        fillColor: tooLong
                            ? Colors.red.shade50
                            : Theme.of(context).colorScheme.surfaceContainerHighest,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: tooLong
                              ? const BorderSide(color: Colors.red, width: 2)
                              : BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 10),
                        suffixText: tooLong ? '$bytes/$maxBytes' : null,
                        suffixStyle: const TextStyle(
                            color: Colors.red, fontSize: 11),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    decoration: BoxDecoration(
                      color: canSend ? Colors.blue : Colors.grey,
                      shape: BoxShape.circle,
                    ),
                    child: IconButton(
                      icon: _isSending
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.send, color: Colors.white),
                      onPressed: canSend ? _send : null,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
