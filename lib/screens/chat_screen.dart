import 'dart:async';
import 'package:flutter/material.dart';

import '../models/chat_models.dart';
import '../services/meshtastic_service.dart';
import '../widgets/delivery_indicator.dart';

/// Chat entre nodos de la mesh: canal Primary (broadcast) + DMs a cada nodo.
class ChatScreen extends StatefulWidget {
  final MeshtasticService meshtasticService;

  const ChatScreen({super.key, required this.meshtasticService});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  StreamSubscription<ChatMessage>? _messageSubscription;

  ChatDestination _selectedDestination = ChatDestination.primaryChannel;
  List<ChatMessage> _filteredMessages = [];
  bool _isSending = false;
  int _currentByteCount = 0;

  MeshtasticService get _service => widget.meshtasticService;

  bool get _isMessageTooLong =>
      _currentByteCount > MeshtasticService.maxMessageBytes;

  @override
  void initState() {
    super.initState();
    _service.clearUnreadForDestination(_selectedDestination);
    _service.addListener(_onServiceChange);
    _messageSubscription = _service.messageStream.listen(
      (_) {
        _updateFilteredMessages();
        _scrollToBottom();
      },
      onError: (e) => debugPrint('❌ [CHAT] $e'),
    );
    _updateFilteredMessages();
    _messageController.addListener(_onTextChanged);
  }

  void _onTextChanged() {
    setState(() {
      _currentByteCount =
          MeshtasticService.getUtf8ByteLength(_messageController.text);
    });
  }

  @override
  void dispose() {
    _messageController.removeListener(_onTextChanged);
    _messageController.dispose();
    _scrollController.dispose();
    _service.removeListener(_onServiceChange);
    _messageSubscription?.cancel();
    super.dispose();
  }

  void _onServiceChange() => _updateFilteredMessages();

  void _updateFilteredMessages() {
    if (!mounted) return;
    setState(() {
      _filteredMessages =
          _service.getMessagesForDestination(_selectedDestination);
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || !_service.isConnected) return;
    setState(() => _isSending = true);
    final success = await _service.sendChatMessage(
      text,
      channel: _selectedDestination.isChannel
          ? _selectedDestination.channel
          : null,
      destinationId:
          _selectedDestination.isChannel ? null : _selectedDestination.nodeId,
    );
    setState(() => _isSending = false);
    if (success) {
      _messageController.clear();
      _scrollToBottom();
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error al enviar mensaje')),
      );
    }
  }

  List<DropdownMenuItem<ChatDestination>> _buildDestinationItems() {
    final items = <DropdownMenuItem<ChatDestination>>[];
    final seen = <ChatDestination>{};

    void addItem(DropdownMenuItem<ChatDestination> item) {
      if (seen.add(item.value!)) items.add(item);
    }

    addItem(DropdownMenuItem(
      value: ChatDestination.primaryChannel,
      child: Row(
        children: [
          const Icon(Icons.campaign, size: 18),
          const SizedBox(width: 8),
          Expanded(
            // El nombre sale de la configuración del radio, no escrito a mano:
            // así el canal privado del cliente aparece por su nombre.
            child: Text(
              'Canal 0: ${_service.channelName(0)}',
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (_service.channelIsPrivate(0))
            const Padding(
              padding: EdgeInsets.only(left: 4),
              child: Icon(Icons.lock, size: 14, color: Colors.green),
            ),
          if (_service.hasUnreadOnChannel(0)) _unreadDot(),
        ],
      ),
    ));

    for (final node in _service.onlineNodes) {
      final destination = ChatDestination.directMessage(node);
      final hasUnread = _service.hasUnreadFromNode(node.nodeId);
      addItem(DropdownMenuItem(
        value: destination,
        child: Row(
          children: [
            // Verde = el radio lo ha oído hace poco. Gris = está en el catálogo
            // pero lleva rato mudo (típicamente, batería agotada).
            Icon(
              Icons.person,
              size: 18,
              color: node.isOnline ? Colors.green : Colors.grey,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                node.isOnline
                    ? node.displayName
                    : '${node.displayName} · ${_hace(node.lastSeen)}',
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontWeight: hasUnread ? FontWeight.bold : null,
                  color: node.isOnline ? null : Colors.grey,
                ),
              ),
            ),
            if (hasUnread) _unreadDot(),
          ],
        ),
      ));
    }

    if (!seen.contains(_selectedDestination)) {
      addItem(DropdownMenuItem(
        value: _selectedDestination,
        child: Row(
          children: [
            const Icon(Icons.person_off, size: 18, color: Colors.grey),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _selectedDestination.displayName,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontStyle: FontStyle.italic),
              ),
            ),
          ],
        ),
      ));
    }
    return items;
  }


  /// "hace 5 min", "hace 3 h", "hace 2 d" — para saber si un nodo sigue vivo.
  String _hace(DateTime? cuando) {
    if (cuando == null) return 'sin señal';
    final s = DateTime.now().difference(cuando).inSeconds;
    if (s < 60) return 'hace un momento';
    final m = s ~/ 60;
    if (m < 60) return 'hace $m min';
    final h = m ~/ 60;
    if (h < 24) return 'hace $h h';
    return 'hace ${h ~/ 24} d';
  }

  Widget _unreadDot() => Container(
        width: 8,
        height: 8,
        margin: const EdgeInsets.only(left: 4),
        decoration:
            const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
      );

  Widget _buildMessageBubble(ChatMessage message, bool showDateSeparator) {
    final alignment =
        message.isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start;
    final bubbleColor = message.isMine
        ? Colors.blue.shade100
        : Theme.of(context).colorScheme.surfaceContainerHighest;

    return Column(
      crossAxisAlignment: alignment,
      children: [
        if (showDateSeparator)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16.0),
            child: Center(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(message.formattedDate,
                    style:
                        TextStyle(fontSize: 12, color: Colors.grey.shade700)),
              ),
            ),
          ),
        Container(
          margin: EdgeInsets.only(
            left: message.isMine ? 48 : 8,
            right: message.isMine ? 8 : 48,
            top: 4,
            bottom: 4,
          ),
          child: Column(
            crossAxisAlignment: alignment,
            children: [
              if (!message.isMine)
                Padding(
                  padding: const EdgeInsets.only(left: 12, bottom: 2),
                  child: Text(message.fromNodeName,
                      style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade600,
                          fontWeight: FontWeight.w500),
                      overflow: TextOverflow.ellipsis),
                ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: bubbleColor,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  crossAxisAlignment: alignment,
                  children: [
                    Text(message.messageText,
                        style: const TextStyle(fontSize: 15)),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (!message.isDirectMessage)
                          Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: Text('CH${message.channel}',
                                style: TextStyle(
                                    fontSize: 10,
                                    color: Colors.grey.shade500)),
                          ),
                        Text(message.formattedTime,
                            style: TextStyle(
                                fontSize: 10, color: Colors.grey.shade500)),
                        if (message.isMine)
                          Padding(
                            padding: const EdgeInsets.only(left: 4),
                            child: DeliveryIndicator(
                                status: message.deliveryStatus),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildMessageList() {
    if (_filteredMessages.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.chat_bubble_outline,
                size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text('No hay mensajes',
                style: TextStyle(fontSize: 16, color: Colors.grey.shade600)),
          ],
        ),
      );
    }
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: _filteredMessages.length,
      itemBuilder: (context, index) {
        final message = _filteredMessages[index];
        final showDateSeparator = index == 0 ||
            !message.isSameDay(_filteredMessages[index - 1]);
        return _buildMessageBubble(message, showDateSeparator);
      },
    );
  }

  Widget _buildInputArea() {
    final maxBytes = MeshtasticService.maxMessageBytes;
    final byteCountColor =
        _isMessageTooLong ? Colors.red : Colors.grey.shade600;
    final canSend =
        _service.isConnected && !_isSending && !_isMessageTooLong;

    return Container(
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    minLines: 1,
                    maxLines: 4,
                    decoration: InputDecoration(
                      hintText: 'Mensaje...',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: _isMessageTooLong
                            ? const BorderSide(color: Colors.red, width: 2)
                            : BorderSide.none,
                      ),
                      filled: true,
                      fillColor: _isMessageTooLong
                          ? Colors.red.shade50
                          : Theme.of(context)
                              .colorScheme
                              .surfaceContainerHighest,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 10),
                    ),
                    textInputAction: TextInputAction.send,
                    onSubmitted: canSend ? (_) => _sendMessage() : null,
                    enabled: _service.isConnected,
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
                    onPressed: canSend ? _sendMessage : null,
                  ),
                ),
              ],
            ),
            if (_currentByteCount > 0)
              Padding(
                padding: const EdgeInsets.only(top: 4, right: 56),
                child: Align(
                  alignment: Alignment.centerRight,
                  child: Text('$_currentByteCount/$maxBytes bytes',
                      style: TextStyle(
                          fontSize: 11,
                          color: byteCountColor,
                          fontWeight: _isMessageTooLong
                              ? FontWeight.bold
                              : FontWeight.normal)),
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chat Mesh'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              border: Border(bottom: BorderSide(color: Colors.grey.shade300)),
            ),
            child: InputDecorator(
              decoration: InputDecoration(
                labelText: 'Enviar a',
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8)),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<ChatDestination>(
                  value: _selectedDestination,
                  isExpanded: true,
                  items: _buildDestinationItems(),
                  onChanged: (value) {
                    if (value != null) {
                      _service.clearUnreadForDestination(value);
                      setState(() => _selectedDestination = value);
                      _updateFilteredMessages();
                    }
                  },
                ),
              ),
            ),
          ),
          Expanded(child: _buildMessageList()),
          _buildInputArea(),
        ],
      ),
    );
  }
}
