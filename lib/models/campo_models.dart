/// Modelos del módulo Campo (captura agroindustrial sobre la mesh).
///
/// El catálogo NO viene de internet: lo pide la app al gateway por LoRa
/// (`@agcat`) y lo guarda en el teléfono. Así la captura funciona donde no hay
/// ninguna señal, que es justo el punto del producto.
library;

import 'dart:math';

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
    this.hatoEsperado,
  });

  final String codigo; // L1
  final String nombre; // El Alto
  final String cultivo; // CAF (puede venir vacío)
  final List<String> parcelas; // [P1, P2, P3]

  /// Cabezas que debería haber (solo ganadería). Lo usa el simulador de cámara.
  final int? hatoEsperado;

  String get etiqueta => '$codigo · $nombre';
}

/// Resultado de una pasada de la cámara de conteo.
class ConteoCamara {
  const ConteoCamara(this.cabezas, this.confianza);

  final int cabezas;
  final double confianza;
}

/// Simula lo que vería una cámara contando el ganado del potrero.
///
/// No cuenta perfecto a propósito: la confianza varía y el error crece cuando
/// baja, igual que con polvo, sombra o animales cruzándose. Un contador que
/// siempre acierta no es creíble, y esconde que la confianza importa.
ConteoCamara simularConteo(int cabezasReales, {double luz = 0.93}) {
  final r = Random();
  // Box-Muller para una variación con forma de campana, no plana.
  final u1 = 1 - r.nextDouble();
  final u2 = r.nextDouble();
  final gauss = luz + 0.04 * sqrt(-2 * log(u1)) * cos(2 * pi * u2);
  final confianza = gauss.clamp(0.72, 0.995);
  final margen = ((1 - confianza) * cabezasReales * 0.35).round();
  final desvio = margen == 0 ? 0 : r.nextInt(margen * 2 + 1) - margen;
  return ConteoCamara(
    max(0, cabezasReales + desvio),
    double.parse(confianza.toStringAsFixed(2)),
  );
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

  /// "AGCAT|ESP|La Esperanza|L1:El Alto:CAF:P1,P2,P3[:hato]|..."
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
        // Quinto campo opcional: solo lo traen los lotes de ganadería.
        hatoEsperado:
            campos.length > 4 ? int.tryParse(campos[4].trim()) : null,
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
              'hato': l.hatoEsperado,
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
              hatoEsperado: (l['hato'] as num?)?.toInt(),
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
