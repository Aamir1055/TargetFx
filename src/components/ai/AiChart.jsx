import { AI_BASE_URL, aiAPI } from '../../services/api'

// A server-rendered chart (PNG), sent as a `chart` SSE event: { id, title, url }.
const AiChart = ({ id, title, url }) => (
  <figure className="max-w-[760px]">
    <img src={url ? `${AI_BASE_URL}${url}` : aiAPI.fileUrl(id)} alt={title || 'Chart'} className="block w-full rounded-lg border border-slate-200 bg-white" loading="lazy" />
    {title && <figcaption className="mt-1.5 text-xs text-slate-500">{title}</figcaption>}
  </figure>
)

export default AiChart
