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
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `한국 병원/약국의 약 봉투 이미지입니다. 아래 JSON 형식으로만 응답하세요. 설명·마크다운 없이 JSON만 출력하세요.

추출 규칙:
- name: 약 이름(성분명 또는 제품명). 여러 약이면 쉼표로 구분. 읽기 어려우면 부분이라도 기재
- dose: 1회 복용량 (예: 5ml, 1포, 1정, 2.5ml). 단위 포함
- freq: 복용 횟수와 시간 (예: 하루 3회 식후 30분, 1일 2회 아침저녁)
- note: 총 처방일수, 처방 병·의원명, 주의사항 등 나머지 유용한 정보

읽을 수 없는 항목은 빈 문자열("")로 표기.

{"name":"","dose":"","freq":"","note":""}`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' },
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
