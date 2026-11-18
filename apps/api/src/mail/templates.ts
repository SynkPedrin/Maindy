import type { MailMessage } from "./mailer.js";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function layout(opts: { preheader: string; title: string; paragraphs: string[]; cta: { label: string; url: string }; footer: string }): string {
  const p = opts.paragraphs.map((x) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#C9CED8">${esc(x)}</p>`).join("");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#07080B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07080B;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0E1016;border:1px solid #1E2230;border-radius:16px;padding:32px">
<tr><td>
<div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#F4F6FA;margin-bottom:24px">maindy.</div>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#F4F6FA">${esc(opts.title)}</h1>
${p}
<p style="margin:24px 0"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:#F4F6FA;color:#07080B;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${esc(opts.cta.label)}</a></p>
<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#7C8394">Se o botão não funcionar, copie e cole este link no navegador:</p>
<p style="margin:0 0 24px;font-size:12px;line-height:1.5;color:#7C8394;word-break:break-all">${esc(opts.cta.url)}</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:#7C8394">${esc(opts.footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function verificationEmail(to: string, name: string, url: string): MailMessage {
  const first = name.split(" ")[0] ?? name;
  const paragraphs = [
    `Olá, ${first}! Falta só confirmar seu e-mail para ativar sua conta na maindy.`,
    "Este link vale por 24 horas e só pode ser usado uma vez.",
  ];
  const footer = "Se você não criou uma conta na maindy., ignore este e-mail — nada será ativado.";
  return {
    to,
    subject: "Confirme seu e-mail — maindy.",
    html: layout({ preheader: "Confirme seu e-mail para ativar sua conta.", title: "Confirme seu e-mail", paragraphs, cta: { label: "Confirmar e-mail", url }, footer }),
    text: `maindy.\n\n${paragraphs.join("\n\n")}\n\nConfirmar e-mail: ${url}\n\n${footer}\n`,
  };
}

export function passwordResetEmail(to: string, name: string, url: string): MailMessage {
  const first = name.split(" ")[0] ?? name;
  const paragraphs = [
    `Olá, ${first}! Recebemos um pedido para redefinir a senha da sua conta na maindy.`,
    "Este link vale por 1 hora e só pode ser usado uma vez. Ao redefinir, todas as sessões abertas serão encerradas.",
  ];
  const footer = "Se você não pediu a redefinição, ignore este e-mail — sua senha continua a mesma.";
  return {
    to,
    subject: "Redefinição de senha — maindy.",
    html: layout({ preheader: "Redefina sua senha da maindy.", title: "Redefinir senha", paragraphs, cta: { label: "Redefinir senha", url }, footer }),
    text: `maindy.\n\n${paragraphs.join("\n\n")}\n\nRedefinir senha: ${url}\n\n${footer}\n`,
  };
}
