import 'dart:async';
import 'package:flutter/material.dart';

import '../models/chat_models.dart';
import '../services/meshtastic_service.dart';
import 'gateway_chat_screen.dart';

/// Pestaña Familia: lista de contactos (familiares) traídos del gateway por la
/// mesh. Al tocar uno se abre la conversación dirigida con esa persona.
class FamilyScreen extends StatefulWidget {
  final MeshtasticService meshtasticService;

  const FamilyScreen({super.key, required this.meshtasticService});

  @override
  State<FamilyScreen> createState() => _FamilyScreenState();
}

class _FamilyScreenState extends State<FamilyScreen> {
  MeshtasticService get _service => widget.meshtasticService;
  StreamSubscription<ChatMessage>? _sub;

  @override
  void initState() {
    super.initState();
    _service.addListener(_onChange);
    _sub = _service.messageStream.listen((_) {
      if (mounted) setState(() {});
    });
    _refreshContacts();
  }

  @override
  void dispose() {
    _service.removeListener(_onChange);
    _sub?.cancel();
    super.dispose();
  }

  void _onChange() {
    if (mounted) setState(() {});
  }

  void _refreshContacts() {
    if (_service.isConnected) _service.requestContacts();
  }

  void _openContact(int id, String name) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => GatewayChatScreen(
        meshtasticService: _service,
        channel: GatewayChannel.family,
        contactId: id,
        contactName: name,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final contacts = _service.familyContactList();

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.people),
            SizedBox(width: 8),
            Text('Familia'),
          ],
        ),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Actualizar contactos',
            onPressed: _service.isConnected ? _refreshContacts : null,
          ),
        ],
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
                    style:
                        TextStyle(fontSize: 12, color: Colors.orange.shade900),
                  ),
                ),
              ),
      ),
      body: contacts.isEmpty
          ? _buildEmpty()
          : ListView.separated(
              itemCount: contacts.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final c = contacts[i];
                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Colors.green.shade100,
                    child: Text(
                      c.value.isNotEmpty ? c.value[0].toUpperCase() : '?',
                      style: TextStyle(color: Colors.green.shade800),
                    ),
                  ),
                  title: Text(c.value),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _openContact(c.key, c.value),
                );
              },
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
            const Icon(Icons.people_outline, size: 64, color: Colors.green),
            const SizedBox(height: 16),
            Text(
              _service.isConnected
                  ? 'Sin contactos asignados a este nodo'
                  : 'Conéctate a tu nodo para ver tus contactos',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 16, color: Colors.grey.shade700),
            ),
            const SizedBox(height: 8),
            Text(
              'Los contactos los asigna el administrador en el sistema. '
              'Toca 🔄 para pedir la lista al gateway.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade500),
            ),
            if (_service.isConnected) ...[
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _refreshContacts,
                icon: const Icon(Icons.refresh),
                label: const Text('Pedir contactos'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
