// Embed timeline -- vertical event timeline for verification session history.
// Shows: Sale submitted > Link created > Customer opened > Completed/Declined/Expired.

export type TimelineStep = {
  label:     string;
  timestamp: string | null;
  status:    "done" | "active" | "pending";
};

export function EmbedTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 min-h-0">
          {/* Dot + connector line */}
          <div className="flex flex-col items-center">
            <span
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                step.status === "done"
                  ? "bg-green-500 border-green-500"
                  : step.status === "active"
                  ? "bg-blue-500 border-blue-500"
                  : "bg-white border-gray-200"
              }`}
            >
              {step.status === "done" && (
                <svg
                  className="w-2.5 h-2.5 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {step.status === "active" && (
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </span>
            {/* Connector line to next item */}
            {i < steps.length - 1 && (
              <span
                className={`w-0.5 flex-1 min-h-[20px] ${
                  step.status === "done" ? "bg-green-200" : "bg-gray-100"
                }`}
              />
            )}
          </div>

          {/* Step label + timestamp */}
          <div className="pb-4 last:pb-0 flex-1 min-w-0">
            <p
              className={`text-xs font-medium ${
                step.status === "pending" ? "text-gray-400" : "text-gray-700"
              }`}
            >
              {step.label}
            </p>
            {step.timestamp && (
              <p className="text-xs text-gray-400 mt-0.5">{step.timestamp}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
