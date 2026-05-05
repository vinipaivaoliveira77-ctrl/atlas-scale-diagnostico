import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { event_name, email, phone, name, event_source_url, client_user_agent, fbp, fbc } = req.body;

  // Validar campos obrigatórios
  if (!event_name) {
    return res.status(400).json({ error: 'event_name is required' });
  }

  // Função para fazer hash SHA-256 com lowercase + trim
  function hashValue(value) {
    if (!value) return null;
    return crypto
      .createHash('sha256')
      .update(value.toLowerCase().trim())
      .digest('hex');
  }

  // Construir user_data com hashes
  const userData = {};

  if (email) userData.em = [hashValue(email)];

  if (phone) {
    // Remover caracteres não numéricos do telefone
    const phoneDigitsOnly = phone.replace(/\D/g, '');
    userData.ph = [hashValue(phoneDigitsOnly)];
  }

  if (name) {
    const nameParts = name.trim().split(' ');
    if (nameParts[0]) userData.fn = [hashValue(nameParts[0])];
    if (nameParts.length > 1) {
      userData.ln = [hashValue(nameParts.slice(1).join(' '))];
    }
  }

  // Adicionar dados de contexto (não hasheados)
  if (client_user_agent) userData.client_user_agent = client_user_agent;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  // Extrair IP do header x-forwarded-for (Vercel adiciona automaticamente)
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  if (clientIp) userData.client_ip_address = clientIp;

  // Construir payload para Meta Conversions API
  const payload = {
    data: [
      {
        event_name: event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: event_source_url || req.headers.referer || '',
        action_source: 'website',
        user_data: userData,
      },
    ],
  };

  // Se META_TEST_EVENT_CODE estiver definido, adicionar para testes
  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Meta API Error:', data);
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error calling Meta API:', error);
    return res.status(500).json({ error: error.message });
  }
}
