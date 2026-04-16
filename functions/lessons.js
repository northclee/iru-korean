export async function onRequest(context) {
  const { env, request } = context;

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  const token = env.NOTION_TOKEN;
  const dbId  = env.NOTION_LESSONS_DB;

  if (!token || !dbId) {
    return new Response(JSON.stringify({ error: 'Missing env vars', token: !!token, dbId: !!dbId }), { status: 500, headers: cors });
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 200 }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return new Response(JSON.stringify({ error: `Notion ${res.status}`, detail: errBody }), { status: 200, headers: cors });
    }

    const data = await res.json();

    /* DEBUG MODE — visit /lessons?debug=1 */
    const isDebug = new URL(request.url).searchParams.get('debug') === '1';
    if (isDebug) {
      const sample = (data.results || []).slice(0, 3).map(p => ({
        id: p.id,
        propNames: Object.keys(p.properties),
        propTypes: Object.fromEntries(Object.entries(p.properties).map(([k,v]) => [k, v.type])),
        sectionRaw: p.properties?.Section ?? 'NOT FOUND',
        titleRaw: p.properties?.Title ?? p.properties?.Name ?? 'NOT FOUND',
      }));
      return new Response(JSON.stringify({ total: data.results?.length, sample }, null, 2), { status: 200, headers: cors });
    }

    const SECTION_MAP = {
      'Basic Grammar':        'grammar',
      'Intermediate Grammar': 'grammar',
      'Advanced Grammar':     'advanced',
      'Basic Speaking':       'speaking',
      'Advanced Speaking':    'speaking',
      'Basic Vocabulary':     'vocab',
      'Advanced Vocabulary':  'vocab',
      'Travel':               'travel',
      'TOPIK Writing':        'topik',
      'TOPIK Listening':      'topik',
      'Free Tier':            'basics',
    };

    const tabs = { basics:[], grammar:[], speaking:[], vocab:[], travel:[], topik:[], advanced:[] };

    (data.results || []).forEach(page => {
      const props = page.properties || {};
      const titleProp = props.Title || props.Name || props.Lesson;
      const title = titleProp?.title?.[0]?.plain_text?.trim() || 'Untitled';
      const sectionProp = props.Section || props.section;
      const section = sectionProp?.select?.name || sectionProp?.multi_select?.[0]?.name || '';
      const kwProp = props['Keyword #'] || props.Keywords;
      const keywords = kwProp?.rich_text?.map(t => t.plain_text).join('') || '';
      const tab = SECTION_MAP[section];
      if (!tab) return;
      tabs[tab].push({ n:'', t:title, d:keywords||section, l:section, section, free:section==='Free Tier'||section==='Travel', id:page.id });
    });

    return new Response(JSON.stringify(tabs), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 200, headers: cors });
  }
}
