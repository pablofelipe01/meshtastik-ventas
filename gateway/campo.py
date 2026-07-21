"""
campo.py — Captura agroindustrial desde la mesh (módulo Campo).

El operario captura un dato en campo SIN señal; viaja por LoRa al gateway, que lo
valida contra el catálogo, lo guarda en Supabase y lo espeja en Airtable. Una
webapp lo muestra en vivo. Lo que hoy el cliente ve en horas o días, aquí llega
en segundos.

Protocolo (compacto: la mesh son ~200 bytes por paquete):

    @ag|FRJ|L1|P2|47           frutos rojos: lote 1, parcela 2, 47 frutos
    @ag|JOR|L1|P2|38.5         jornal: 38,5 kg
    @ag|PLG|L3|P1|BRC|3        plaga broca, severidad 3
    @ag|CEN|L2|P4|CAF|1250     censo: café, 1.250 kg
    @ag|GAN|L5|P1|127|0.94     ganado: 127 cabezas, confianza 0,94

Un campo final opcional `t<epoch>` indica cuándo se capturó realmente (cola
offline de la app):  @ag|FRJ|L1|P2|47|t1753048800

Tres decisiones que hacen que esto quepa en un paquete:
  1. El NODO identifica al operario: no viaja quién capturó.
  2. El operario está anclado a su finca, así que "L1" basta (los códigos de lote
     son únicos dentro de la finca, no globalmente).
  3. El gateway valida y expande: rellena nombres, cultivo y coordenadas.

Config por .env:
  SUPABASE_URL, SUPABASE_SERVICE_KEY      (requeridas; sin ellas el módulo no arranca)
  AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID   (opcionales: espejo)
  CAMPO_CATALOG_REFRESH_SECONDS (def 300)  refresco del catálogo en memoria
  CAMPO_FLUSH_SECONDS (def 5)              reintento de la cola local
  CAMPO_AIRTABLE_SECONDS (def 10)          ciclo del espejo a Airtable
"""
import json
import logging
import os
import re
import threading
import time
from datetime import datetime, timezone

import requests

from claude_mesh import send_text

log = logging.getLogger("campo")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
AIRTABLE_TOKEN = os.getenv("AIRTABLE_TOKEN", "").strip()
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID", "").strip()
AIRTABLE_TABLE_ID = os.getenv("AIRTABLE_TABLE_ID", "").strip()
CATALOG_REFRESH_SECONDS = float(os.getenv("CAMPO_CATALOG_REFRESH_SECONDS", "300"))
FLUSH_SECONDS = float(os.getenv("CAMPO_FLUSH_SECONDS", "5"))
AIRTABLE_SECONDS = float(os.getenv("CAMPO_AIRTABLE_SECONDS", "10"))
_HTTP_TIMEOUT = 15

ENABLED = bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)
AIRTABLE_ENABLED = bool(AIRTABLE_TOKEN and AIRTABLE_BASE_ID and AIRTABLE_TABLE_ID)

PREFIX = "@ag|"

# Etiquetas de los desplegables de Airtable (deben coincidir con la tabla).
TIPO_LABEL = {
    "FRJ": "FRJ · Frutos rojos",
    "JOR": "JOR · Jornal",
    "PLG": "PLG · Plaga",
    "CEN": "CEN · Censo",
    "GAN": "GAN · Ganado",
}
PLAGA_LABEL = {
    "BRC": "BRC · Broca", "ROY": "ROY · Roya", "MIN": "MIN · Minador",
    "MON": "MON · Monilia", "ESC": "ESC · Escoba de bruja",
    "SIG": "SIG · Sigatoka negra", "PCG": "PCG · Pudrición del cogollo",
    "PIC": "PIC · Picudo", "GAR": "GAR · Garrapata",
}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _node_hex(node_num) -> str:
    try:
        return f"!{int(node_num) & 0xFFFFFFFF:08x}"
    except (TypeError, ValueError):
        return str(node_num)


def _headers(extra=None):
    h = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _rest(method, path, **kw):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    return requests.request(method, url, timeout=_HTTP_TIMEOUT, **kw)


def _num(s: str):
    """Convierte a número aceptando coma decimal ('38,5' → 38.5)."""
    return float(str(s).strip().replace(",", "."))


# ---------- Catálogo en memoria ----------
# Se consulta en cada captura, así que vive en RAM y se refresca cada N segundos.
_catalog = {
    "operarios": {},   # node_num -> dict
    "lotes": {},       # (finca, codigo) -> dict
    "parcelas": {},    # (lote_id, codigo) -> dict
    "cultivos": {},    # codigo -> dict
    "plagas": {},      # codigo -> dict
    "fincas": {},      # codigo -> dict
    "loaded_at": 0.0,
}
_catalog_lock = threading.Lock()


def _get(path):
    r = _rest("GET", path, headers=_headers())
    r.raise_for_status()
    return r.json()


def load_catalog() -> None:
    """Trae el catálogo completo de Supabase a memoria."""
    fincas = _get("campo_fincas?select=codigo,nombre,municipio,departamento")
    operarios = _get("campo_operarios?select=id,node_num,nombre,tipo,finca_codigo,"
                     "tarifa_kg&activo=eq.true")
    lotes = _get("campo_lotes?select=id,finca_codigo,codigo,nombre,cultivo,lat,lng")
    parcelas = _get("campo_parcelas?select=id,lote_id,codigo,nombre,lat,lng")
    cultivos = _get("campo_cultivos?select=codigo,nombre,unidad_cosecha")
    plagas = _get("campo_plagas?select=codigo,nombre,cultivo")

    with _catalog_lock:
        _catalog["fincas"] = {f["codigo"]: f for f in fincas}
        _catalog["operarios"] = {o["node_num"]: o for o in operarios
                                 if o.get("node_num") is not None}
        _catalog["lotes"] = {(l["finca_codigo"], l["codigo"]): l for l in lotes}
        _catalog["parcelas"] = {(p["lote_id"], p["codigo"]): p for p in parcelas}
        _catalog["cultivos"] = {c["codigo"]: c for c in cultivos}
        _catalog["plagas"] = {p["codigo"]: p for p in plagas}
        _catalog["loaded_at"] = time.time()

    log.info("🌱 catálogo: %d fincas, %d lotes, %d parcelas, %d operarios",
             len(fincas), len(lotes), len(parcelas), len(operarios))


def _maybe_refresh(force: bool = False) -> None:
    """Refresca el catálogo si está viejo (o si un código no se encontró)."""
    with _catalog_lock:
        age = time.time() - _catalog["loaded_at"]
    if force and age < 30:
        return  # evita martillar Supabase con tramas inválidas repetidas
    if force or age > CATALOG_REFRESH_SECONDS:
        try:
            load_catalog()
        except Exception as e:
            log.error("✗ catálogo: %s", e)


# ---------- Parseo y validación ----------
class CampoError(Exception):
    """Error de formato o de validación: su texto va de vuelta al operario."""


def is_campo_message(text: str) -> bool:
    return bool(text) and text.strip().lower().startswith(PREFIX)


def _parse(text: str, from_num: int) -> dict:
    """Convierte una trama '@ag|...' en la fila de campo_capturas. Lanza CampoError."""
    parts = [p.strip() for p in text.strip().split("|")]
    if len(parts) < 4:
        raise CampoError("formato. Usa @ag|TIPO|LOTE|PARCELA|valor")

    # Campo final opcional t<epoch>: cuándo se capturó de verdad (cola offline).
    capturado_at = None
    if re.fullmatch(r"t\d{9,13}", parts[-1] or ""):
        raw_ts = int(parts[-1][1:])
        if raw_ts > 10**11:      # venía en milisegundos
            raw_ts //= 1000
        capturado_at = datetime.fromtimestamp(raw_ts, timezone.utc).isoformat()
        parts = parts[:-1]

    tipo = parts[1].upper()
    if tipo not in TIPO_LABEL:
        raise CampoError(f"tipo {tipo}. Usa FRJ, JOR, PLG, CEN o GAN")

    with _catalog_lock:
        operario = _catalog["operarios"].get(from_num)
    if not operario:
        raise CampoError(f"nodo {_node_hex(from_num)} sin operario registrado")

    finca = operario["finca_codigo"]
    lote_cod, parcela_cod = parts[2].upper(), parts[3].upper()

    with _catalog_lock:
        lote = _catalog["lotes"].get((finca, lote_cod))
    if not lote:
        raise CampoError(f"lote {lote_cod} no existe en {finca}")

    with _catalog_lock:
        parcela = _catalog["parcelas"].get((lote["id"], parcela_cod))
    if not parcela:
        raise CampoError(f"parcela {parcela_cod} no existe en {lote_cod}")

    resto = parts[4:]
    datos, cultivo = {}, lote.get("cultivo")
    unidad = ""

    try:
        if tipo == "FRJ":
            if not resto:
                raise CampoError("falta el conteo")
            valor, unidad = _num(resto[0]), "frutos"
            datos["estado"] = "maduro"

        elif tipo == "JOR":
            if not resto:
                raise CampoError("falta el peso en kg")
            valor, unidad = _num(resto[0]), "kg"
            if operario.get("tarifa_kg"):
                datos["tarifa_kg"] = float(operario["tarifa_kg"])
                datos["pago_cop"] = round(valor * float(operario["tarifa_kg"]))

        elif tipo == "PLG":
            if len(resto) < 2:
                raise CampoError("usa @ag|PLG|lote|parcela|PLAGA|severidad")
            plaga_cod = resto[0].upper()
            with _catalog_lock:
                plaga = _catalog["plagas"].get(plaga_cod)
            if not plaga:
                raise CampoError(f"plaga {plaga_cod} desconocida")
            sev = int(_num(resto[1]))
            if not 1 <= sev <= 5:
                raise CampoError("severidad debe ser 1..5")
            valor, unidad = sev, "severidad"
            datos.update({"plaga": plaga_cod, "plaga_nombre": plaga["nombre"],
                          "severidad": sev})

        elif tipo == "CEN":
            if len(resto) < 2:
                raise CampoError("usa @ag|CEN|lote|parcela|CULTIVO|cantidad")
            cultivo_cod = resto[0].upper()
            with _catalog_lock:
                cul = _catalog["cultivos"].get(cultivo_cod)
            if not cul:
                raise CampoError(f"cultivo {cultivo_cod} desconocido")
            cultivo = cultivo_cod
            valor, unidad = _num(resto[1]), cul["unidad_cosecha"]

        else:  # GAN
            if not resto:
                raise CampoError("falta el número de cabezas")
            valor, unidad = int(_num(resto[0])), "cabezas"
            if len(resto) > 1:
                conf = _num(resto[1])
                datos["confianza"] = conf if conf <= 1 else conf / 100.0
                datos["fuente"] = "camara"
    except CampoError:
        raise
    except (ValueError, TypeError):
        raise CampoError("valor numérico inválido")

    return {
        "tipo": tipo,
        "finca_codigo": finca,
        "lote_id": lote["id"],
        "parcela_id": parcela["id"],
        "lote_codigo": lote_cod,
        "parcela_codigo": parcela_cod,
        "cultivo": cultivo,
        "node_num": from_num,
        "operario_id": operario["id"],
        "operario_nombre": operario["nombre"],
        "valor": valor,
        "unidad": unidad,
        "datos": datos,
        "lat": parcela.get("lat"),
        "lng": parcela.get("lng"),
        "raw": text.strip(),
        "capturado_at": capturado_at,
    }


# ---------- Cola local (sobrevive caídas de internet y reinicios) ----------
_OUTBOX_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "campo_outbox.json")
_outbox = []
_outbox_seq = 0
_outbox_lock = threading.Lock()


def _load_outbox() -> None:
    global _outbox, _outbox_seq
    try:
        with open(_OUTBOX_PATH) as f:
            _outbox = json.load(f)
        _outbox_seq = max((it.get("_id", 0) for it in _outbox), default=0)
        if _outbox:
            log.info("📤 campo outbox: %d capturas pendientes", len(_outbox))
    except FileNotFoundError:
        _outbox = []
    except Exception as e:
        log.error("✗ campo outbox load: %s", e)
        _outbox = []


def _save_outbox() -> None:
    try:
        tmp = _OUTBOX_PATH + ".tmp"
        with open(tmp, "w") as f:
            json.dump(_outbox, f)
        os.replace(tmp, _OUTBOX_PATH)
    except Exception as e:
        log.error("✗ campo outbox save: %s", e)


def _enqueue(row: dict) -> None:
    global _outbox_seq
    with _outbox_lock:
        _outbox_seq += 1
        row = dict(row, _id=_outbox_seq)
        _outbox.append(row)
        _save_outbox()


def _flush_once() -> None:
    """Escribe en Supabase las capturas pendientes. Se detiene al primer fallo."""
    with _outbox_lock:
        items = list(_outbox)
    if not items:
        return
    escritas = set()
    for it in items:
        payload = {k: v for k, v in it.items() if k != "_id" and v is not None}
        try:
            r = _rest("POST", "campo_capturas", json=payload, headers=_headers())
            r.raise_for_status()
            escritas.add(it["_id"])
            log.info("🌱 %s %s%s valor=%s → Supabase (%s)", it["tipo"],
                     it["lote_codigo"], it["parcela_codigo"], it["valor"],
                     it["operario_nombre"])
        except Exception:
            break  # sin internet: conserva todo y reintenta el próximo ciclo
    if escritas:
        with _outbox_lock:
            _outbox[:] = [x for x in _outbox if x["_id"] not in escritas]
            _save_outbox()


# ---------- Entrada desde la mesh ----------
def handle_campo(interface, from_num: int, text: str) -> None:
    """Procesa una trama '@ag|...' y responde ACK corto por la mesh."""
    if not ENABLED:
        return
    try:
        try:
            row = _parse(text, from_num)
        except CampoError:
            # Puede ser catálogo viejo (lote nuevo, operario recién dado de alta).
            _maybe_refresh(force=True)
            row = _parse(text, from_num)

        _enqueue(row)
        ack = f"✓ {row['tipo']} {row['lote_codigo']}{row['parcela_codigo']} " \
              f"{row['valor']:g} {row['unidad']}"
        send_text(interface, from_num, ack[:190])
        log.info("🌱 captura de %s (%s): %s", row["operario_nombre"],
                 _node_hex(from_num), row["raw"])
    except CampoError as e:
        send_text(interface, from_num, f"✗ {e}"[:190])
        log.warning("✗ captura inválida de %s: %s (%s)",
                    _node_hex(from_num), text.strip(), e)
    except Exception as e:
        log.error("✗ campo handle: %s", e)
        try:
            send_text(interface, from_num, "✗ error interno del gateway")
        except Exception:
            pass


# ---------- Espejo a Airtable ----------
def _airtable_fields(cap: dict) -> dict:
    """Traduce una fila de campo_capturas a los campos de la tabla Mesh-1."""
    with _catalog_lock:
        finca = _catalog["fincas"].get(cap.get("finca_codigo")) or {}
        cultivo = _catalog["cultivos"].get(cap.get("cultivo")) or {}
    datos = cap.get("datos") or {}

    valor = cap.get("valor")
    f = {
        "Name": f"{cap['tipo']} · {cap.get('finca_codigo')} "
                f"{cap.get('lote_codigo')}{cap.get('parcela_codigo')} · {valor:g}"
                if valor is not None else cap["tipo"],
        "Tipo": TIPO_LABEL.get(cap["tipo"], cap["tipo"]),
        "Lote": cap.get("lote_codigo"),
        "Parcela": cap.get("parcela_codigo"),
        "Operario": cap.get("operario_nombre"),
        "Nodo": _node_hex(cap.get("node_num")),
        "Valor": float(valor) if valor is not None else None,
        "Unidad": cap.get("unidad"),
        "Lat": cap.get("lat"),
        "Lng": cap.get("lng"),
        "Recibido": cap.get("recibido_at"),
        "Capturado": cap.get("capturado_at"),
        "Supabase ID": cap.get("id"),
        "Trama": cap.get("raw"),
    }
    if finca:
        f["Finca"] = f"{finca['codigo']} · {finca['nombre']}"
    if cultivo:
        f["Cultivo"] = f"{cultivo['codigo']} · {cultivo['nombre']}"
    if datos.get("plaga"):
        f["Plaga"] = PLAGA_LABEL.get(datos["plaga"], datos["plaga"])
    if datos.get("severidad"):
        f["Severidad"] = int(datos["severidad"])
    if datos.get("confianza") is not None:
        f["Confianza"] = float(datos["confianza"])
    return {k: v for k, v in f.items() if v is not None}


def _mirror_once() -> None:
    """Sube a Airtable las capturas que aún no se han espejado."""
    pendientes = _get("campo_capturas?airtable_synced_at=is.null"
                      "&order=recibido_at.asc&limit=10")
    if not pendientes:
        return
    url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE_ID}"
    headers = {"Authorization": f"Bearer {AIRTABLE_TOKEN}",
               "Content-Type": "application/json"}
    for cap in pendientes:
        try:
            body = {"records": [{"fields": _airtable_fields(cap)}],
                    "typecast": True}
            r = requests.post(url, json=body, headers=headers,
                              timeout=_HTTP_TIMEOUT)
            r.raise_for_status()
            rec_id = r.json()["records"][0]["id"]
            _rest("PATCH", f"campo_capturas?id=eq.{cap['id']}",
                  json={"airtable_record_id": rec_id,
                        "airtable_synced_at": _now_iso()},
                  headers=_headers()).raise_for_status()
            log.debug("🪞 captura %s → Airtable %s", cap["id"], rec_id)
        except Exception as e:
            log.error("✗ espejo Airtable (captura %s): %s", cap.get("id"), e)
            break  # reintenta en el próximo ciclo


# ---------- Hilos ----------
def flush_pending() -> None:
    """Fuerza un intento de escritura de la cola (p. ej. al cerrar el simulador)."""
    try:
        _flush_once()
    except Exception as e:
        log.error("✗ campo flush: %s", e)


def _flush_loop(stop_event) -> None:
    while not stop_event.is_set():
        try:
            _flush_once()
        except Exception as e:
            log.error("✗ campo flush: %s", e)
        stop_event.wait(FLUSH_SECONDS)


def _catalog_loop(stop_event) -> None:
    while not stop_event.is_set():
        stop_event.wait(CATALOG_REFRESH_SECONDS)
        if not stop_event.is_set():
            _maybe_refresh()


def _airtable_loop(stop_event) -> None:
    while not stop_event.is_set():
        try:
            _mirror_once()
        except Exception as e:
            log.error("✗ campo espejo: %s", e)
        stop_event.wait(AIRTABLE_SECONDS)


def start(stop_event) -> None:
    """Arranca el módulo Campo (si está configurado)."""
    if not ENABLED:
        log.info("🌱 Módulo Campo desactivado (falta SUPABASE_URL/SERVICE_KEY).")
        return
    try:
        load_catalog()
    except Exception as e:
        log.error("✗ catálogo inicial: %s (se reintenta)", e)
    _load_outbox()
    threading.Thread(target=_flush_loop, args=(stop_event,), daemon=True).start()
    threading.Thread(target=_catalog_loop, args=(stop_event,), daemon=True).start()
    if AIRTABLE_ENABLED:
        log.info("🪞 Espejo Airtable activo → base %s", AIRTABLE_BASE_ID)
        threading.Thread(target=_airtable_loop, args=(stop_event,),
                         daemon=True).start()
    else:
        log.info("🪞 Espejo Airtable desactivado (falta AIRTABLE_TOKEN/BASE/TABLE).")
    log.info("🌱 Módulo Campo activo. Tramas @ag|...")
