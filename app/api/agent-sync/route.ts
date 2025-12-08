// src/app/api/agent-sync/route.ts
import { NextResponse } from 'next/server';
import net from 'net';

export async function POST(req: Request) {
  const body = await req.json();

  // Map frontend request to Python Server Protocol
  // type "0" = Interact (Call Agent)
  // type "1" = Sync (Update Vector DB + Get Recommendation)
  const payload = {
    type: body.type, // Now dynamic: "0" or "1"
    id: body.id,     // Agent Name (if type 0) or Doc ID (if type 1)
    data: body.data  // The content
  };

  return new Promise((resolve) => {
    const client = new net.Socket();
    const HOST = '127.0.0.1';
    const PORT = 65432;

    let responseData = '';

    client.connect(PORT, HOST, () => {
      client.write(JSON.stringify(payload));
    });

    client.on('data', (data) => {
      responseData += data.toString();
      client.destroy();
    });

    client.on('close', () => {
      try {
        // Parse the JSON response from Python
        const parsed = JSON.parse(responseData);
        resolve(NextResponse.json(parsed));
      } catch (e) {
        console.error("Error parsing Python response", responseData);
        // Fallback for demo if python isn't running perfectly
        resolve(NextResponse.json({ type: body.type, data: "Error: Could not parse response." }));
      }
    });

    client.on('error', (err) => {
      console.error("Socket error", err);
      resolve(NextResponse.json({ error: "Connection failed" }, { status: 500 }));
    });
  });
}