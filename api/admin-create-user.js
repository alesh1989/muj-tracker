// Vercel Serverless Function — vytvoření uživatele adminem
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY; // Service role key!

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Chybí SUPABASE_SERVICE_KEY v Environment Variables" });
  }

  let body;
  try {
    if (typeof req.body === "string") body = JSON.parse(req.body);
    else if (req.body && typeof req.body === "object") body = req.body;
    else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    }
  } catch(e) { return res.status(400).json({ error: "Invalid JSON: " + e.message }); }

  const { email, password, name } = body;
  if (!email || !password) return res.status(400).json({ error: "Email a heslo jsou povinné" });

  try {
    // Create user via Supabase Admin API
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true, // auto-confirm
        user_metadata: { display_name: name || "" }
      })
    });
    const userData = await createRes.json();
    if (!createRes.ok) return res.status(400).json({ error: userData.message || JSON.stringify(userData) });

    // Auto-approve and set display name in user_profiles
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userData.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ approved: true, display_name: name || "" })
      }
    );

    return res.status(200).json({ success: true, userId: userData.id });
  } catch(err) {
    return res.status(500).json({ error: "Chyba: " + err.message });
  }
}
