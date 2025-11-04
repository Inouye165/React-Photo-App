export type ApiFlavor = "chat" | "responses";

export type VisionInput = {
  systemText?: string;
  userText: string;
  imageUrlOrDataUrl: string; // https:// or data:image/jpeg;base64,...
  detail?: "low" | "high" | "auto";
};

export function buildVisionContent(
  flavor: ApiFlavor,
  { systemText, userText, imageUrlOrDataUrl, detail = "high" }: VisionInput
) {
  if (flavor === "responses") {
    // Responses API schema
    return [
      ...(systemText ? [{ role: "system", content: [{ type: "input_text", text: systemText }] as const }] : []),
      {
        role: "user",
        content: [
          { type: "input_text", text: userText },
          { type: "input_image", image_url: { url: imageUrlOrDataUrl, detail } }
        ] as const
      }
    ];
  }
  // Chat Completions / LangChain ChatOpenAI schema
  return [
    ...(systemText ? [{ role: "system", content: systemText }] : []),
    {
      role: "user",
      content: [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: imageUrlOrDataUrl, detail } }
      ] as const
    }
  ];
}
