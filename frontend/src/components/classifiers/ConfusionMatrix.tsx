"use client";

type Props = {
  matrix: number[][];
  labels: string[];
};

export default function ConfusionMatrix({ matrix, labels }: Props) {
  const maxVal = Math.max(...matrix.flat());

  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1" />
            {labels.map((l) => (
              <th key={l} className="px-3 py-1 text-center text-gray-600 font-medium">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="px-3 py-1 font-medium text-gray-700">{labels[i]}</td>
              {row.map((val, j) => {
                const intensity = maxVal > 0 ? val / maxVal : 0;
                const bg =
                  i === j
                    ? `rgba(34, 197, 94, ${0.15 + intensity * 0.6})`
                    : val > 0
                    ? `rgba(239, 68, 68, ${0.1 + intensity * 0.4})`
                    : "transparent";
                return (
                  <td
                    key={j}
                    className="px-3 py-2 text-center font-mono rounded"
                    style={{ backgroundColor: bg }}
                  >
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-6 mt-3 text-xs text-gray-500">
        <span>Rows = Actual</span>
        <span>Columns = Predicted</span>
      </div>
    </div>
  );
}
