/**
 * Cloudflare Pages Function — fetches Notion content database
 * 
 * Deploy path in your project:  functions/content.js
 * (Cloudflare Pages automatically routes /content → this file)
 *
 * Environment variables (set in Cloudflare dashboard):
 *   NOTION_TOKEN        — your Notion integration secret
 *   NOTION_CONTENT_DB   — your 32-char Notion database ID
 */

export async function onRequest(context) {
  const { env } = context;

  const token = env.NOTION_TOKEN;
  const dbId  = env.NOTION_CONTENT_DB;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
  };

  if (!token || !dbId) {
    return new Response(
      JSON.stringify({ error: 'Missing NOTION_TOKEN or NOTION_CONTENT_DB' }),
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100 }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Notion API ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    const map = {};

    data.results.forEach(page => {
      const key = page.properties?.Key?.title?.[0]?.plain_text?.trim();
      const richText = page.properties?.Value?.rich_text;
      if (!key || !richText) return;

      map[key] = richText.map(t => {
        let text = t.plain_text
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (t.annotations?.bold)   text = `<strong>${text}</strong>`;
        if (t.annotations?.italic) text = `<em>${text}</em>`;
        if (t.href) text = `<a href="${t.href}">${text}</a>`;
        return text;
      }).join('');
    });

    return new Response(JSON.stringify(map), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}
