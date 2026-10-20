// Friendlier labels for the tool names the backend logs (agent.py `tool_start`/`tool_end`).
const TOOL_LABELS = {
  get_client_overview: 'Looking up client overview',
  search_clients: 'Searching clients',
  search_open_positions: 'Searching open positions',
  net_positions_by_exchange: 'Computing net exposure',
  margin_call_accounts: 'Checking margin levels',
  settlement_bill: 'Building settlement bill',
  settlement_weeks: 'Looking up settlement weeks',
  render_chart: 'Drawing chart',
  export_table: 'Exporting file',
  export_report: 'Exporting report',
  propose_credit_action: 'Preparing credit action',
  propose_rule_action: 'Preparing rule action',
  propose_account_action: 'Preparing account action',
}
const labelFor = (name) => TOOL_LABELS[name] || (name ? name.replace(/_/g, ' ') : 'Working')

// Shown while the assistant is still working: one line per tool call made so far, each
// ticked off as its `tool_end` event arrives. Built from the message's `steps` array, which
// the SSE handler appends to on every `tool_start` / `tool_end` / `progress` event.
const AiWorkingSteps = ({ steps, stage }) => {
  if (!steps?.length && !stage) return null
  return (
    <div className="flex max-w-[560px] flex-col gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-3">
      {stage && (
        <div className="flex items-center gap-2 text-[13px] text-slate-600">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />
          <span className="min-w-0 flex-1 truncate">{stage}</span>
        </div>
      )}
      {steps?.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-slate-500">
          {steps.map((step, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className={`w-3.5 shrink-0 tabular-nums ${step.ok === false ? 'text-red-600' : step.ok ? 'text-emerald-600' : 'text-blue-500'}`}>
                {step.ok === false ? '✕' : step.ok ? '✓' : '…'}
              </span>
              <span className="min-w-0 flex-1 truncate">{labelFor(step.name)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default AiWorkingSteps
