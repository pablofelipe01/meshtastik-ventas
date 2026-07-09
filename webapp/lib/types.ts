export type Node = {
  node_num: number;
  node_id: string | null;
  long_name: string | null;
  short_name: string | null;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  battery: number | null;
  is_gateway: boolean;
  last_position_at: string | null;
  last_seen: string | null;
};

export type Direction = "to_field" | "from_field";
export type Status = "pending" | "sent" | "delivered" | "failed";

export type Message = {
  id: string;
  node_num: number;
  direction: Direction;
  text: string;
  sender_name: string | null;
  status: Status;
  created_at: string;
  delivered_at: string | null;
};

export function nodeName(n: Node): string {
  return (
    n.long_name?.trim() ||
    n.short_name?.trim() ||
    n.node_id ||
    `!${(n.node_num >>> 0).toString(16)}`
  );
}
