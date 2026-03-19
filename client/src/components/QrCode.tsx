// Simple visual QR placeholder — replace with qrcode.react in production
interface QRCodeProps {
  value: string;
  size?: number;
}

export default function QRCode({ value, size = 160 }: QRCodeProps) {
  // Generate a deterministic grid pattern from the URL for visual demo
  const hash = value.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const cells = 21;
  const cellSize = Math.floor(size / cells);
  
  const grid: boolean[][] = Array.from({ length: cells }, (_, r) =>
    Array.from({ length: cells }, (_, c) => {
      // Always fill corners (finder patterns)
      if ((r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7)) return true;
      // Pseudo-random fill based on URL hash
      return ((r * cells + c + hash + r * c) % 3) !== 0;
    })
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{
        background: '#fff',
        padding: 12,
        borderRadius: 8,
        display: 'inline-block',
        border: '2px solid var(--gold)',
      }}>
        <svg width={cells * cellSize} height={cells * cellSize} viewBox={`0 0 ${cells * cellSize} ${cells * cellSize}`}>
          {grid.map((row, r) =>
            row.map((filled, c) =>
              filled ? (
                <rect
                  key={`${r}-${c}`}
                  x={c * cellSize}
                  y={r * cellSize}
                  width={cellSize - 1}
                  height={cellSize - 1}
                  fill="#0a0a08"
                  rx={0.5}
                />
              ) : null
            )
          )}
        </svg>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', textAlign: 'center', maxWidth: size, wordBreak: 'break-all' }}>
        {value.length > 60 ? value.slice(0, 60) + '…' : value}
      </div>
    </div>
  );
}
