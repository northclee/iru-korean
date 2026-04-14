/**
 * Cloudflare Pages Function — functions/lessons.js
 * Fetches lessons from your Notion database and maps them to website tabs
 *
 * Env vars needed in Cloudflare dashboard:
 *   NOTION_TOKEN       — your integration secret
 *   NOTION_LESSONS_DB  — your lessons database ID
 */

/* ── Map your Notion section names → website tab keys ── */
const SECTION_MAP = {
  'Basic Grammar':        'grammar',
  'Intermediate Grammar': 'grammar',
  'Advanced Grammar':     'grammar',
  'Basic Speaking':       'speaking',
  'Advanced Speaking':    'speaking',
  'Basic Vocabulary':     'vocab',
  'Advanced Vocabulary':  'vocab',
  'Travel':               'travel',
  'TOPIK Writing':        'topik',
  'TOPIK Listening':      'topik',
  'Free Tier':            'basics',
  'Practice Hub':         null,   /* not shown in lesson tabs */
  'Tool Box':             null,
  'Premium':              null,
};

/* ── Level label from section name ── */
const LEVEL_MAP = {
  'Basic Grammar':        'Beginner',
  'Intermediate Grammar': 'Intermediate',
  'Advanced Grammar':     'Advanced',
  'Basic Speaking':       'Beginner',
  'Advanced Speaking':    'Advanced',
  'Basic Vocabulary':     'Beginner',
  'Advanced Vocabulary':  'Advanced',
  'Travel':               'Beginner',
  'TOPIK Writing':        'TOPIK II',
  'TOPIK Listening':      'TOPIK I',
  'Free Tier':            'Beginner',
};

export async function onRequest(context) {
  const { env, request } = context;
  const token = env.NOTION_TOKEN;
  const dbId  = env.NOTION_LESSONS_DB;

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
  };

  if (!token || !dbId) {
    return new Response(
      JSON.stringify({ error: 'Missing NOTION_TOKEN or NOTION_LESSONS_DB' }),
      { status: 500, headers: cors }
    );
  }

  try {
    /* Fetch all lessons — sorted by lesson number */
    const res = await fetch(
      `https://api.notion.com/v1/databases/${dbId}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page_size: 200,
          sorts: [{ property: 'Number', direction: 'ascending' }],
        }),
      }
    );

    if (!res.ok) throw new Error(`Notion API ${res.status}`);
    const data = await res.json();

    /* ── Organise lessons by tab ── */
    const tabs = {
      basics:   [],
      grammar:  [],
      speaking: [],
      vocab:    [],
      travel:   [],
      topik:    [],
      advanced: [],
    };

    data.results.forEach(page => {
      /* Title */
      const title = page.properties?.Title?.title?.[0]?.plain_text?.trim() || 'Untitled';

      /* Section */
      const section = page.properties?.Section?.select?.name || '';

      /* Lesson number — column is called 'Number' */
      const num = page.properties?.['Number']?.number ?? null;

      /* Keywords — column is called 'Keyword #', type is rich_text */
      let keywords = '';
      const kwProp = page.properties?.['Keyword #'];
      if (kwProp?.rich_text) {
        keywords = kwProp.rich_text.map(t => t.plain_text).join('');
      } else if (kwProp?.multi_select) {
        keywords = kwProp.multi_select.map(k => k.name).join(' · ');
      }

      /* Tier — infer from section */
      const isFree = section === 'Free Tier' || section === 'Travel';

      /* Map section → tab */
      const tab = SECTION_MAP[section];
      if (!tab) return; /* skip Practice Hub, Tool Box, null sections */

      const level = LEVEL_MAP[section] || 'All levels';

      const lesson = {
        n:       num ? String(num).padStart(2,'0') : '—',
        t:       title,
        d:       keywords || section,   /* use keywords as description if no description column */
        l:       level,
        section: section,
        free:    isFree,
        id:      page.id,               /* Notion page ID — for deep links later */
      };

      tabs[tab].push(lesson);

      /* Also add advanced grammar/speaking/vocab to the 'advanced' tab */
      if (section === 'Advanced Grammar' || section === 'Advanced Speaking' || section === 'Advanced Vocabulary') {
        tabs.advanced.push({ ...lesson });
      }
    });

    return new Response(JSON.stringify(tabs), { status: 200, headers: cors });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: cors }
    );
  }
}
