import 'dart:async';
import 'package:flutter/material.dart';

import '../models/chat_models.dart';
import '../services/meshtastic_service.dart';
import '../widgets/delivery_indicator.dart';

/// Pantalla de conversación con el gateway, reutilizable para dos canales:
///  - [GatewayChannel.claude]: la app antepone `@claude` al enviar; muestra las
///    respuestas de la IA (reensamblando fragmentos).
///  - [GatewayChannel.family]: envía texto plano (el gateway lo reenvía a la
///    familia por internet); muestra los mensajes que la familia manda de vuelta.
///
/// Ambos canales comparten el mismo nodo gateway por DM; se separan por prefijo
/// vía [MeshtasticService.parseGatewayEntries].
class GatewayChatScreen extends StatefulWidget {
  final MeshtasticService meshtasticService;
  final GatewayChannel channel;

  const GatewayChatScreen({
    super.key,
    required this.meshtasticService,
    required this.channel,
  });

  @override
  State<GatewayChatScreen> createState() => _GatewayChatScreenState();
}

class _GatewayChatScreenState extends State<GatewayChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  StreamSubscription<ChatMessage>? _sub;
  bool _isSending = false;

  MeshtasticService get _service => widget.meshtasticService;
  bool get _isClaude => widget.channel == GatewayChannel.claude;

  // Presentación según el canal.
  String get _title => _isClaude ? 'Claude' : 'Familia';
  IconData get _titleIcon => _isClaude ? Icons.smart_toy : Icons.people;
  IconData get _senderIcon => _isClaude ? Icons.smart_toy : Icons.person;
  Color get _accent => _isClaude ? Colors.blueGrey : Colors.green.shade700;
  String get _sendPrefix => _isClaude ? '@claude ' : '';
  String get _hint =>
      _isClaude ? 'Pregúntale a Claude…' : 'Escribe a tu familia…';

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
      '$_sendPrefix$q',
      destinationId: _service.currentGatewayNodeId,
    );
    setState(() => _isSending = false);
    if (ok) {
      _controller.clear();
      _scrollToBottom();
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo enviar a $_title')),
      );
    }
  }

  List<GatewayEntry> get _entries => _service
      .parseGatewayEntries()
      .where((e) => e.channel == widget.channel)
      .toList();

  Widget _buildBubble(GatewayEntry e) {
    final align = e.isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start;
    final color = e.isMine
        ? Colors.blue.shade100
        : Theme.of(context).colorScheme.surfaceContainerHighest;
    final senderLabel =
        _isClaude ? 'Claude' : (e.senderName ?? 'Familia');
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
            Padding(
              padding: const EdgeInsets.only(left: 10, bottom: 2),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(_senderIcon, size: 14, color: _accent),
                  const SizedBox(width: 4),
                  Text(senderLabel,
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: _accent)),
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
    final title = _isClaude ? 'Pregúntale a Claude' : 'Chat con tu familia';
    final body = _isClaude
        ? 'Escribe cualquier pregunta. Va por la red mesh al gateway, que '
            'consulta a Claude y responde aquí. No necesitas internet en el teléfono.'
        : 'Escribe un mensaje. Viaja por la red mesh hasta el gateway y de ahí '
            'por internet a tu familia. Sus respuestas aparecen aquí. Sin '
            'internet ni celular en el teléfono.';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(_isClaude ? Icons.smart_toy_outlined : Icons.people_outline,
                size: 64, color: _accent),
            const SizedBox(height: 16),
            Text(title,
                style: TextStyle(fontSize: 18, color: Colors.grey.shade700)),
            const SizedBox(height: 8),
            Text(body,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final entries = _entries;
    final maxBytes = MeshtasticService.maxMessageBytes;
    final bytes = MeshtasticService.getUtf8ByteLength(
        '$_sendPrefix${_controller.text}');
    final tooLong = bytes > maxBytes;
    final canSend = _service.isConnected && !_isSending && !tooLong;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Row(
          children: [
            Icon(_titleIcon),
            const SizedBox(width: 8),
            Text(_title),
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
                        hintText: _hint,
                        filled: true,
                        fillColor: tooLong
                            ? Colors.red.shade50
                            : Theme.of(context)
                                .colorScheme
                                .surfaceContainerHighest,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: tooLong
                              ? const BorderSide(color: Colors.red, width: 2)
                              : BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 10),
                        suffixText: tooLong ? '$bytes/$maxBytes' : null,
                        suffixStyle:
                            const TextStyle(color: Colors.red, fontSize: 11),
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
