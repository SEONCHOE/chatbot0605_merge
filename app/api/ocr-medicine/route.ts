import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-openai-key') || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API 키가 없습니다.' }, { status: 500 });
  }

  try {
    const { imageBase64, mimeType } = await req.json();

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `이 약 봉투 이미지에서 다음 정보를 추출해서 JSON으로만 응답해줘. 없는 항목은 빈 문자열로.
{
  "name": "약 이름 (성분명이나 제품명)",
  "dose": "1회 용량 (예: 5ml, 1포, 1정)",
  "freq": "복용 횟수 (예: 하루 3회, 식후 30분)",
  "note": "그 외 복약 지시사항 (예: 7일치, 해열제, 처방병원명)"
}`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'low' },
            },
          ],
        }],
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    // JSON 파싱
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: '인식 실패' }, { status: 422 });

    const parsed = JSON.parse(match[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
