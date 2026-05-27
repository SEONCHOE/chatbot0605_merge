import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'no key' }, { status: 500 });

  const city = req.nextUrl.searchParams.get('city') || 'Seoul';

  try {
    // 날씨
    const wRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=ko`
    );
    const w = await wRes.json();

    // 대기질 (위/경도 필요)
    const lat = w.coord?.lat;
    const lon = w.coord?.lon;
    let aqi = null;
    let pm25 = null;
    let pm10 = null;

    if (lat && lon) {
      const aRes = await fetch(
        `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`
      );
      const a = await aRes.json();
      aqi = a.list?.[0]?.main?.aqi ?? null;
      pm25 = a.list?.[0]?.components?.pm2_5 ?? null;
      pm10 = a.list?.[0]?.components?.pm10 ?? null;
    }

    return NextResponse.json({
      temp: Math.round(w.main?.temp ?? 0),
      feels: Math.round(w.main?.feels_like ?? 0),
      desc: w.weather?.[0]?.description ?? '',
      icon: w.weather?.[0]?.icon ?? '',
      humidity: w.main?.humidity ?? null,
      city: w.name ?? city,
      aqi,
      pm25: pm25 !== null ? Math.round(pm25) : null,
      pm10: pm10 !== null ? Math.round(pm10) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
