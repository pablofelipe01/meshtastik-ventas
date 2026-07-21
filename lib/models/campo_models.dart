/// Modelos del módulo Campo (captura agroindustrial sobre la mesh).
///
/// El catálogo NO viene de internet: lo pide la app al gateway por LoRa
/// (`@agcat`) y lo guarda en el teléfono. Así la captura funciona donde no hay
/// ninguna señal, que es justo el punto del producto.
library;

import 'package:flutter/material.dart';

/// Los cinco tipos de captura. El código de 3 letras es lo que viaja por radio.
enum CampoTipo {
  frj('FRJ', 'Frutos rojos', Icons.grain, 'frutos'),
  jor('JOR', 'Jornal', Icons.scale, 'kg'),
  cen('CEN', 'Censo', Icons.inventory_2, ''),
  plg('PLG', 'Plaga', Icons.pest_control, ''),
  gan('GAN', 'Ganado', Icons.agriculture, 'cabezas');

  const CampoTipo(this.codigo, this.label, this.icono, this.unidad);

  final String codigo;
  final String label;
  final IconData icono;

  /// Unidad sugerida; vacía si depende del cultivo o no aplica.
  final String unidad;

  /// El valor que teclea el operario admite decimales (peso) o no (conteos).
  bool get admiteDecimales => this == CampoTipo.jor;
}

class CampoLote {
  const CampoLote({
    required this.codigo,
    required this.nombre,
    required this.cultivo,
    required this.parcelas,
  });

  final String codigo; // L1
  final String nombre; // El Alto
  final String cultivo; // CAF (puede venir vacío)
  final List<String> parcelas; // [P1, P2, P3]

  String get etiqueta => '$codigo · $nombre';
}

/// Catálogo de la finca del operario, tal como lo envió el gateway.
class CampoCatalogo {
  const CampoCatalogo({
    required this.fincaCodigo,
    required this.fincaNombre,
    required this.lotes,
    required this.plagas,
  });

  final String fincaCodigo;
  final String fincaNombre;
  final List<CampoLote> lotes;
  final Map<String, String> plagas; // BRC -> Broca

  bool get vacio => lotes.isEmpty;

  /// "AGCAT|ESP|La Esperanza|L1:El Alto:CAF:P1,P2,P3|..."
  static CampoCatalogo? parseAgcat(String s, Map<String, String> plagas) {
    final parts = s.split('|');
    if (parts.length < 3 || parts[0] != 'AGCAT') return null;
    final lotes = <CampoLote>[];
    for (var i = 3; i < parts.length; i++) {
      final campos = parts[i].split(':');
      if (campos.length < 4 || campos[0].isEmpty) continue;
      lotes.add(CampoLote(
        codigo: campos[0].trim(),
        nombre: campos[1].trim(),
        cultivo: campos[2].trim(),
        parcelas: campos[3]
            .split(',')
            .map((p) => p.trim())
            .where((p) => p.isNotEmpty)
            .toList(),
      ));
    }
    return CampoCatalogo(
      fincaCodigo: parts[1].trim(),
      fincaNombre: parts[2].trim(),
      lotes: lotes,
      plagas: plagas,
    );
  }

  /// "AGPLG|BRC:Broca|ROY:Roya|..."
  static Map<String, String> parseAgplg(String s) {
    final out = <String, String>{};
    final parts = s.split('|');
    for (var i = 1; i < parts.length; i++) {
      final c = parts[i].indexOf(':');
      if (c <= 0) continue;
      final cod = parts[i].substring(0, c).trim();
      final nom = parts[i].substring(c + 1).trim();
      if (cod.isNotEmpty) out[cod] = nom.isEmpty ? cod : nom;
    }
    return out;
  }

  Map<String, dynamic> toJson() => {
        'finca': fincaCodigo,
        'fincaNombre': fincaNombre,
        'plagas': plagas,
        'lotes': [
          for (final l in lotes)
            {
              'codigo': l.codigo,
              'nombre': l.nombre,
              'cultivo': l.cultivo,
              'parcelas': l.parcelas,
            }
        ],
      };

  static CampoCatalogo fromJson(Map<String, dynamic> j) => CampoCatalogo(
        fincaCodigo: j['finca'] as String? ?? '',
        fincaNombre: j['fincaNombre'] as String? ?? '',
        plagas: Map<String, String>.from(j['plagas'] as Map? ?? {}),
        lotes: [
          for (final l in (j['lotes'] as List? ?? []))
            CampoLote(
              codigo: l['codigo'] as String? ?? '',
              nombre: l['nombre'] as String? ?? '',
              cultivo: l['cultivo'] as String? ?? '',
              parcelas: List<String>.from(l['parcelas'] as List? ?? []),
            )
        ],
      );
}

/// Captura esperando salir por la mesh (sin cobertura o envío fallido).
///
/// Guarda la hora REAL de captura: al llegar al gateway, la diferencia con la
/// hora de recepción es la demora que hoy el cliente sufre en horas o días.
class CampoPendiente {
  const CampoPendiente({required this.trama, required this.capturada});

  final String trama; // sin el sufijo t<epoch>
  final DateTime capturada;

  /// Trama lista para la radio, con la marca de captura.
  String get tramaConHora =>
      '$trama|t${capturada.millisecondsSinceEpoch ~/ 1000}';

  Map<String, dynamic> toJson() =>
      {'trama': trama, 'ts': capturada.millisecondsSinceEpoch};

  static CampoPendiente fromJson(Map<String, dynamic> j) => CampoPendiente(
        trama: j['trama'] as String,
        capturada:
            DateTime.fromMillisecondsSinceEpoch((j['ts'] as num).toInt()),
      );
}

/// Resultado de una captura, tal como lo respondió el gateway.
class CampoResultado {
  const CampoResultado({
    required this.ok,
    required this.texto,
    required this.cuando,
  });

  final bool ok;
  final String texto;
  final DateTime cuando;
}
