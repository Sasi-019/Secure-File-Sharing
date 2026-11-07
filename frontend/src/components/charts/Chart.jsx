// A small dependency-free SVG chart (lines, areas or grouped bars).
//
// series: [{ name, color, values }]   values may contain null = "no data":
// lines break at a null instead of dropping to zero, so a period with no
// measurement is never drawn as if the speed were 0.

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 34, left: 58 };

const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

// Round the top of the y axis up to a "nice" number.
function niceMax(value) {
  if (!value || value <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;

  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;

  return nice * magnitude;
}

export default function Chart({
  title,
  labels = [],
  series = [],
  type = "line",
  formatValue = (value) => String(value),
  formatLabel = (label) => label,
  emptyText = "No data recorded for this period yet.",
}) {
  const allValues = series.flatMap((item) =>
    item.values.filter((value) => value != null)
  );

  const hasData = allValues.some((value) => value > 0);

  const maxValue = niceMax(Math.max(0, ...allValues));
  const count = labels.length;

  const xFor = (index) =>
    count <= 1
      ? PAD.left + PLOT_W / 2
      : PAD.left + (index * PLOT_W) / (count - 1);

  const yFor = (value) => PAD.top + PLOT_H - (value / maxValue) * PLOT_H;

  const ticks = [0, 1, 2, 3, 4].map((step) => (maxValue * step) / 4);

  // Show at most ~6 x labels so they never overlap.
  const labelEvery = Math.max(1, Math.ceil(count / 6));

  // Bars sit in equal slots, so they use their own x positions.
  const slot = count > 0 ? PLOT_W / count : PLOT_W;
  const groupWidth = slot * 0.72;
  const barWidth = series.length
    ? Math.max(2, groupWidth / series.length - 1)
    : 0;

  const barX = (index, seriesIndex) =>
    PAD.left +
    index * slot +
    (slot - groupWidth) / 2 +
    seriesIndex * (groupWidth / series.length);

  // Split a series into runs of consecutive non-null points.
  const runsFor = (values) => {
    const runs = [];
    let current = [];

    values.forEach((value, index) => {
      if (value == null) {
        if (current.length) runs.push(current);
        current = [];
      } else {
        current.push([xFor(index), yFor(value)]);
      }
    });

    if (current.length) runs.push(current);

    return runs;
  };

  const pathFor = (run) =>
    run
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`)
      .join(" ");

  const baseline = yFor(0);

  return (
    <figure className="m-0">
      {title && (
        <figcaption className="mb-2 text-sm font-semibold text-slate-200">
          {title}
        </figcaption>
      )}

      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          {series.map((item) => (
            <li key={item.name} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </li>
          ))}
        </ul>
      )}

      {!hasData ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-700 px-4 text-center text-sm text-slate-500">
          {emptyText}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={title || "Chart"}
          className="h-auto w-full"
        >
          {/* Horizontal grid and y-axis labels */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={yFor(tick)}
                y2={yFor(tick)}
                stroke="#1e293b"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={yFor(tick) + 4}
                textAnchor="end"
                fontSize="11"
                fill="#64748b"
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}

          {/* x-axis labels */}
          {labels.map((label, index) =>
            index % labelEvery === 0 || index === count - 1 ? (
              <text
                key={`${label}-${index}`}
                x={type === "bar" ? PAD.left + index * slot + slot / 2 : xFor(index)}
                y={HEIGHT - 10}
                textAnchor="middle"
                fontSize="11"
                fill="#64748b"
              >
                {formatLabel(label)}
              </text>
            ) : null
          )}

          {type === "bar"
            ? series.map((item, seriesIndex) =>
                item.values.map((value, index) =>
                  value == null || value <= 0 ? null : (
                    <rect
                      key={`${item.name}-${index}`}
                      x={barX(index, seriesIndex)}
                      y={yFor(value)}
                      width={barWidth}
                      height={baseline - yFor(value)}
                      rx="2"
                      fill={item.color}
                    >
                      <title>
                        {`${item.name} · ${formatLabel(labels[index])}: ${formatValue(value)}`}
                      </title>
                    </rect>
                  )
                )
              )
            : series.map((item) => (
                <g key={item.name}>
                  {type === "area" &&
                    runsFor(item.values).map((run, runIndex) => (
                      <path
                        key={`area-${runIndex}`}
                        d={`${pathFor(run)} L${run[run.length - 1][0]},${baseline} L${run[0][0]},${baseline} Z`}
                        fill={item.color}
                        opacity="0.15"
                      />
                    ))}

                  {runsFor(item.values).map((run, runIndex) => (
                    <path
                      key={`line-${runIndex}`}
                      d={pathFor(run)}
                      fill="none"
                      stroke={item.color}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}

                  {/* Points: also makes a single isolated measurement visible */}
                  {item.values.map((value, index) =>
                    value == null ? null : (
                      <circle
                        key={`${item.name}-${index}`}
                        cx={xFor(index)}
                        cy={yFor(value)}
                        r={count > 40 ? 2 : 3}
                        fill={item.color}
                      >
                        <title>
                          {`${item.name} · ${formatLabel(labels[index])}: ${formatValue(value)}`}
                        </title>
                      </circle>
                    )
                  )}
                </g>
              ))}
        </svg>
      )}
    </figure>
  );
}
