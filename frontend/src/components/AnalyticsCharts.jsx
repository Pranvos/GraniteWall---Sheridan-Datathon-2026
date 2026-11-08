import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const tipStyle = {
  background: '#ffffff',
  border: '1px solid #e4e4e7',
  borderRadius: 8,
  fontSize: 12,
  color: '#18181b',
  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
}

export function MomentumChart({ data, accent = '#0f62fe' }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="momFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
          <Tooltip contentStyle={tipStyle} />
          <Area
            type="monotone"
            dataKey="detections"
            stroke={accent}
            strokeWidth={2}
            fill="url(#momFill)"
            name="Detections"
          />
          <Area
            type="monotone"
            dataKey="mitigated"
            stroke="#a1a1aa"
            strokeWidth={1.5}
            fill="transparent"
            name="Mitigated"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function RiskBreakdownChart({ data }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={72}
            tick={{ fill: '#52525b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={tipStyle} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={14}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
