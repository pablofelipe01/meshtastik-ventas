#!/usr/bin/env python3
"""
camara_ganado.py — Cámara de conteo de ganado (simulada).

Sustituye la ÚNICA pieza que falta —la inferencia sobre el video— y deja intacto
todo lo demás. Eso importa: la arquitectura real es exactamente esta, porque la
cámara nunca manda la imagen. Hace el conteo donde está y por LoRa viaja solo el
resultado: «117 cabezas, confianza 0,93», unos 20 bytes. Por eso funciona donde
no hay ni señal ni ancho de banda.

Dos modos:

  --lora      El nodo de la cámara va enchufado por USB a esta máquina y la trama
              sale POR RADIO hasta el Central. Es lo fiel: si el cliente pregunta
              «¿eso sí pasa por la malla?», la respuesta es sí.

  --directo   Sin radio: entra por la misma ruta interna del gateway (validación,
              cliente, alerta, cola y espejo). Para desarrollar y para demos donde
              no quieras ocupar un nodo.

Ejemplos:

    # Un conteo normal, por radio, desde el nodo de la cámara
    python camara_ganado.py --lora --puerto /dev/ttyACM1 --lote L1 --parcela P2

    # El momento que vende: faltan 3 reses
    python camara_ganado.py --directo --lote L1 --parcela P2 --faltan 3

    # Vigilancia continua cada 2 minutos
    python camara_ganado.py --directo --lote L1 --parcela P2 --intervalo 120 --veces 0
"""
import argparse
import logging
import os
import random
import sys
import time

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s camara: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("camara")

# Nodo con el que se identifica la cámara. Tiene que estar dado de alta en
# campo_operarios como tipo 'dispositivo', o el gateway la rechazará.
NODO_CAMARA = int(os.getenv("CAMARA_NODE_NUM", "1274121070"))  # Inv7 · !4bf18b6e
NODO_GATEWAY = int(os.getenv("CAMARA_GATEWAY_NODE_NUM", "1082670145"))  # Central


def _hex(n: int) -> str:
    return f"!{n & 0xFFFFFFFF:08x}"


def observar(cabezas_reales: int, luz: float) -> tuple[int, float]:
    """Simula una pasada de la inferencia sobre el video.

    Un contador real no es exacto: se le cruzan animales, hay polvo, sombra. El
    error crece cuando baja la confianza, igual que en la vida.
    """
    confianza = max(0.72, min(0.995, random.gauss(luz, 0.04)))
    # Cuanta menos confianza, más se equivoca (a veces de más, a veces de menos).
    margen = max(0, round((1 - confianza) * cabezas_reales * 0.35))
    visto = cabezas_reales + random.randint(-margen, margen)
    return max(0, visto), round(confianza, 2)


def construir_trama(lote: str, parcela: str, visto: int, conf: float) -> str:
    return f"@ag|GAN|{lote}|{parcela}|{visto}|{conf}"


# ---------- Modo radio ----------
def enviar_por_lora(puerto: str, trama: str) -> None:
    import meshtastic.serial_interface as si

    iface = si.SerialInterface(devPath=puerto)
    try:
        mio = iface.localNode.nodeNum if iface.localNode else None
        if mio != NODO_CAMARA:
            log.warning("El nodo de %s es %s, pero la cámara está registrada "
                        "como %s. El gateway lo rechazará.",
                        puerto, _hex(mio or 0), _hex(NODO_CAMARA))
        iface.sendText(trama, destinationId=NODO_GATEWAY, wantAck=True)
        log.info("📡 %s → %s: %s", _hex(mio or 0), _hex(NODO_GATEWAY), trama)
        time.sleep(3)  # deja salir el paquete antes de cerrar el puerto
    finally:
        try:
            iface.close()
        except Exception:
            pass


# ---------- Modo directo ----------
class _IfaceFalsa:
    """Recoge el acuse del gateway sin pasar por radio."""

    class _Nodo:
        nodeNum = 0

    localNode = _Nodo()

    def sendText(self, text, destinationId=None, wantAck=False, **kw):
        log.info("📨 acuse: %s", text)


def enviar_directo(trama: str) -> None:
    import campo

    if not campo.ENABLED:
        log.error("El módulo Campo no está configurado (revisa .env: "
                  "SUPABASE_URL, SUPABASE_SERVICE_KEY, CAMPO_CLIENTE_ID).")
        sys.exit(1)
    campo.load_catalog()
    log.info("🔌 directo: %s", trama)
    # Misma ruta que una captura real: validación, cliente, alerta, cola y espejo.
    campo.handle_campo(_IfaceFalsa(), NODO_CAMARA, trama)
    campo.flush_pending()


def main():
    ap = argparse.ArgumentParser(
        description="Cámara de conteo de ganado (simulada)")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--lora", action="store_true",
                      help="enviar por radio desde el nodo de la cámara")
    modo.add_argument("--directo", action="store_true",
                      help="entrar por la ruta interna del gateway, sin radio")
    ap.add_argument("--puerto", default="/dev/ttyACM1",
                    help="puerto serie del nodo de la cámara (modo --lora)")
    ap.add_argument("--lote", default="L1", help="lote que vigila la cámara")
    ap.add_argument("--parcela", default="P2", help="parcela")
    ap.add_argument("--cabezas", type=int, default=120,
                    help="cabezas que hay de verdad en el potrero")
    ap.add_argument("--faltan", type=int, default=0,
                    help="simular que faltan N reses (el momento que vende)")
    ap.add_argument("--luz", type=float, default=0.93,
                    help="condiciones de la toma: 0.75 mala, 0.98 excelente")
    ap.add_argument("--intervalo", type=float, default=90,
                    help="segundos entre conteos")
    ap.add_argument("--veces", type=int, default=1,
                    help="cuántos conteos (0 = sin parar, Ctrl-C para salir)")
    args = ap.parse_args()

    reales = max(0, args.cabezas - args.faltan)
    if args.faltan:
        log.info("🐄 hato de %d; simulando que faltan %d → hay %d",
                 args.cabezas, args.faltan, reales)
    else:
        log.info("🐄 hato de %d, completo", reales)

    n = 0
    try:
        while args.veces == 0 or n < args.veces:
            visto, conf = observar(reales, args.luz)
            trama = construir_trama(args.lote, args.parcela, visto, conf)
            if args.lora:
                enviar_por_lora(args.puerto, trama)
            else:
                enviar_directo(trama)
            n += 1
            if args.veces == 0 or n < args.veces:
                time.sleep(args.intervalo)
    except KeyboardInterrupt:
        log.info("Detenida.")


if __name__ == "__main__":
    main()
