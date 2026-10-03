import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatDay } from "@/lib/domain/period";

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 } };

export function DailyChart({ data }: { data: { day: string; entradas: number; conclusoes: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data.map((d) => ({ ...d, label: formatDay(d.day).slice(0, 5) }))}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axis} />
        <YAxis allowDecimals={false} tick={axis} width={28} />
        <Tooltip {...tip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="entradas" name="Entradas" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="conclusoes" name="Conclusões" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HBar({ data, color = "var(--chart-1)" }: { data: { name: string; value: number }[]; color?: string }) {
  if (!data.length) return <p className="text-sm text-muted-foreground">Sem dados no recorte.</p>;
  const rows = data.slice(0, 12);
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 30 + 20)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={axis} />
        <YAxis type="category" dataKey="name" tick={axis} width={150} />
        <Tooltip {...tip} />
        <Bar dataKey="value" name="Demandas" fill={color} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
