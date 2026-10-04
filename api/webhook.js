const BOT = process.env.BOT_TOKEN;
const OWNER = String(process.env.OWNER_ID);
const SB = process.env.SUPABASE_URL;
const SBK = process.env.SUPABASE_KEY;

const DOWNLOAD_LINK = "https://t.me/CloudeHubGfx/876";

const PRICE_TEXT =
  "💎 CLOUDE HUB PREMIUM\n\n" +
  "7 DAYS - 8000 KS\n" +
  "30 DAYS - 15000 KS\n" +
  "60 DAYS - 25000 KS\n\n" +
  "ငွေလွှဲပြီးရင် ပြေစာ (screenshot) ပို့ပေးပါ 🙏";

const sbHeaders = {
  apikey: SBK,
  Authorization: `Bearer ${SBK}`,
  "Content-Type": "application/json",
};

const tgCall = (method, body) =>
  fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const tg = (chat_id, text, extra = {}) =>
  tgCall("sendMessage", { chat_id, text, ...extra });

const getFaq = async () => {
  const r = await fetch(`${SB}/rest/v1/faq?select=id,content&order=id.asc`, {
    headers: sbHeaders,
  });
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
};

const callClaude = async (body) => {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: "claude-sonnet-5-5", ...body }),
  });
  const data = await r.json();
  return data.content?.[0]?.text || "";
};

const has = (text, words) => {
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
};

/* ---------------- Owner ---------------- */
async function handleOwner(text) {
  if (text.startsWith("/add ")) {
    await fetch(`${SB}/rest/v1/faq`, {
      method: "POST",
      headers: sbHeaders,
      body: JSON.stringify({ content: text.slice(5).trim() }),
    });
    return tg(OWNER, "✅ ထည့်ပြီးပါပြီ");
  }
  if (text === "/list") {
    const rows = await getFaq();
    const out = rows.length
      ? rows.map((r) => `#${r.id} ${r.content}`).join("\n\n")
      : "FAQ မရှိသေးပါ";
    return tg(OWNER, out);
  }
  if (text.startsWith("/del ")) {
    const id = parseInt(text.slice(5).trim(), 10);
    if (!id) return tg(OWNER, "ဥပမာ: /del 3");
    await fetch(`${SB}/rest/v1/faq?id=eq.${id}`, {
      method: "DELETE",
      headers: sbHeaders,
    });
    return tg(OWNER, "🗑 ဖျက်ပြီးပါပြီ");
  }
  return tg(OWNER, "Owner Commands:\n/add စာသား\n/list\n/del ID");
}

/* ---------------- Receipt check ---------------- */
async function handleReceipt(msg, username) {
  const chatId = msg.chat.id;

  let fileId = null;
  if (msg.photo?.length) fileId = msg.photo[msg.photo.length - 1].file_id;
  else if (msg.document?.mime_type?.startsWith("image/"))
    fileId = msg.document.file_id;
  if (!fileId) return tg(chatId, "ပြေစာကို ပုံ (screenshot) အဖြစ် ပို့ပေးပါ 🙏");

  await tg(chatId, "ပြေစာ လက်ခံရရှိပါပြီ၊ စစ်ဆေးနေပါတယ် ⏳");

  await tgCall("copyMessage", {
    chat_id: OWNER,
    from_chat_id: chatId,
    message_id: msg.message_id,
  });

  let verdict = "unclear";
  let analysis = "စစ်လို့မရပါ";
  try {
    const fp = await (
      await fetch(`https://api.telegram.org/bot${BOT}/getFile?file_id=${fileId}`)
    ).json();
    const imgRes = await fetch(
      `https://api.telegram.org/file/bot${BOT}/${fp.result.file_path}`
    );
    const b64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
    const path = fp.result.file_path.toLowerCase();
    const mediaType = path.endsWith(".png")
      ? "image/png"
      : path.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

    const text = await callClaude({
      max_tokens: 600,
      system:
        "You check payment receipt screenshots (KBZPay, WaveMoney, AYA Pay, CB Pay, bank transfer, etc.) for signs of editing or forgery. " +
        "Look for: inconsistent fonts/sizes/alignment, blurry or pasted numbers, mismatched colors, missing transaction ID, " +
        "impossible dates, layout that doesn't match the app. " +
        "Valid amounts for this shop: 8000, 15000 or 25000 KS. " +
        "You cannot confirm a real transaction happened, only visual signs. " +
        'Reply ONLY with JSON: {"verdict":"genuine|suspicious|not_receipt|unclear","amount":"","reasons":"short Burmese explanation"}',
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: b64 },
            },
            { type: "text", text: "ဒီပြေစာကို စစ်ပေးပါ။" },
          ],
        },
      ],
    });
    const j = JSON.parse(text.replace(/```json|```/g, "").trim());
    verdict = j.verdict;
    analysis = `ပမာဏ: ${j.amount || "-"}\n${j.reasons || ""}`;
  } catch (e) {
    console.error(e);
  }

  const label =
    {
      genuine: "✅ အစစ်နဲ့တူတယ်",
      suspicious: "⚠️ သံသယရှိတယ် (အတုဖြစ်နိုင်)",
      not_receipt: "❌ ပြေစာမဟုတ်ဘူး",
      unclear: "❓ မရှင်းလင်းဘူး",
    }[verdict] || "❓ မရှင်းလင်းဘူး";

  await tg(
    OWNER,
    `🧾 ပြေစာစစ်ဆေးချက်\n👤 ${username} (${chatId})\n\n${label}\n${analysis}\n\n` +
      "⚠️ AI က ပုံကိုပဲ စစ်တာပါ။ ငွေဝင်/မဝင် ကိုယ့် wallet မှာ ကိုယ်တိုင်ပြန်စစ်ပါ။"
  );

  if (verdict === "not_receipt" || verdict === "unclear") {
    return tg(
      chatId,
      "ပြေစာပုံ မရှင်းလင်းပါဘူး။ ငွေလွှဲမှတ်တမ်း အပြည့်အစုံပါတဲ့ screenshot ကို ထပ်ပို့ပေးပါ 🙏"
    );
  }
  return tg(
    chatId,
    "ပြေစာစစ်ဆေးပြီး Owner ကို အကြောင်းကြားထားပါတယ်။ ခဏစောင့်ပေးပါ 🙏"
  );
}

/* ---------------- Customer ---------------- */
async function handleCustomer(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const username = msg.from?.username
    ? "@" + msg.from.username
    : msg.from?.first_name || "unknown";

  if (msg.photo || msg.document) return handleReceipt(msg, username);

  if (text === "/start") {
    return tg(chatId, "မင်္ဂလာပါ! ဘာကူညီပေးရမလဲ?");
  }

  await tg(OWNER, `👤 ${username} (${chatId}):\n${text}`);

  // 1) ဈေးနှုန်း
  if (
    has(text, ["ဈေး", "စျေး", "ဈေ", "price", "ဘယ်လောက်", "plan", "days", "premium ဝယ်"])
  ) {
    await tg(chatId, PRICE_TEXT);
    return tg(OWNER, `🤖 → ${username}:\n(ဈေးနှုန်း ပို့ပြီး)`);
  }

  // 2) GFX / TOOLS ဘယ်မှာလဲ
  if (has(text, ["gfx", "tool", "download", "ဒေါင်း", "ဘယ်မှာ", "link", "လင့်"])) {
    await tg(chatId, "CLOUDE HUB PREMIUM TOOLS", {
      reply_markup: {
        inline_keyboard: [[{ text: "DOWNLOAD TOOL", url: DOWNLOAD_LINK }]],
      },
    });
    return tg(OWNER, `🤖 → ${username}:\n(Download button ပို့ပြီး)`);
  }

  // 3) ကျန်တာ AI ဖြေ (FAQ ထဲကပဲ)
  const faq = await getFaq();
  const knowledge = faq.map((f) => "- " + f.content).join("\n");
  const system =
    "You are a customer support agent for Cloude Hub. Reply in Burmese, short and polite.\n" +
    "Answer ONLY using the knowledge below. If the answer is not in it, " +
    "say politely that you don't have that information yet.\n\n" +
    "KNOWLEDGE:\n" + (knowledge || "(empty)");

  let reply = "ခဏနေမှ ပြန်ကြိုးစားပါ။";
  try {
    reply =
      (await callClaude({
        max_tokens: 800,
        system,
        messages: [{ role: "user", content: text }],
      })) || reply;
  } catch (e) {}

  await tg(chatId, reply);
  await tg(OWNER, `🤖 → ${username}:\n${reply}`);
}

/* ---------------- Handler ---------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");
  const msg = req.body?.message;
  if (!msg) return res.status(200).send("ok");

  try {
    if (String(msg.chat.id) === OWNER) {
      if (msg.text) await handleOwner(msg.text);
    } else if (msg.text || msg.photo || msg.document) {
      await handleCustomer(msg);
    }
  } catch (e) {
    console.error(e);
  }
  res.status(200).send("ok");
    }
