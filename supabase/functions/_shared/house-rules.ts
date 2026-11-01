export function houseRulesResponse(
  req: Request,
  config: { termsUrl: string; privacyUrl: string; contactEmail: string },
): Response {
  const headers = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  };
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...headers, "access-control-allow-methods": "GET, OPTIONS" },
    });
  }
  if (req.method !== "GET") {
    return Response.json({ ok: false }, { status: 405, headers });
  }
  if (
    ![config.termsUrl, config.privacyUrl].every((url) =>
      /^https:\/\/[^\s]+$/.test(url)
    ) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail)
  ) {
    return Response.json({
      ok: false,
      message: "Our house rules will be here shortly.",
    }, { status: 503, headers });
  }
  return Response.json({
    ok: true,
    terms_version: "2026-10-15",
    minimum_age: 18,
    terms_url: config.termsUrl,
    privacy_url: config.privacyUrl,
    contact_email: config.contactEmail,
    house_rule: "Spill about the book, never the club.",
    acceptance:
      "I am 18 or over and accept the Terms and house rules. Objectionable content and abusive behavior have no place here.",
    report_message:
      "Thank you for looking out for your club. Our team reviews reports within 24 hours.",
  }, { headers });
}
