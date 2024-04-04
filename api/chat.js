// /api/chat.js
import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { randomUUID } from 'crypto';

const baseUrl = "https://chat.openai.com";
const apiUrl = `${baseUrl}/backend-api/conversation`;

let token: string;
let oaiDeviceId: string;

const axiosInstance = axios.create({
  httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
  headers: {
    "Content-Type": "application/json",
    // 添加其它必要的请求头
  },
});
function GenerateCompletionId(prefix: string = "cmpl-") {
	const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	const length = 28;

	for (let i = 0; i < length; i++) {
		prefix += characters.charAt(Math.floor(Math.random() * characters.length));
	}

	return prefix;
}
// 从 OpenAI API 获取新的会话 ID 和令牌
async function getNewSessionId() {
  let newDeviceId = randomUUID();
  const response = await axiosInstance.post(`${baseUrl}/backend-anon/sentinel/chat-requirements`, {}, {
    headers: { "oai-device-id": newDeviceId },
  });
  console.log(`System: Successfully refreshed session ID and token.`);
  oaiDeviceId = newDeviceId;
  token = response.data.token;
}

export default async function handleChatCompletion(req: VercelRequest, res: VercelResponse) {
  if (!token || !oaiDeviceId) {
    await getNewSessionId();
  }

  try {
    const { messages, stream } = req.body;
    const body = {
      action: "next",
      messages: messages.map(message => ({
        author: { role: message.role },
        content: { content_type: "text", parts: [message.content] },
      })),
      parent_message_id: randomUUID(),
      model: "text-davinci-002-render-sha",
      timezone_offset_min: -180,
      suggestions: [],
      history_and_training_disabled: true,
      conversation_mode: { kind: "primary_assistant" },
      websocket_request_id: randomUUID(),
    };

    const response = await axiosInstance.post(apiUrl, body, {
      responseType: "stream",
      headers: {
        "oai-device-id": oaiDeviceId,
        "openai-sentinel-chat-requirements-token": token,
      },
    });

    let fullContent = "";
    let requestId = GenerateCompletionId("chatcmpl-");
    let created = Date.now();

    response.data.on('data', (chunk) => {
      const data = chunk.toString();
      try {
        const parsed = JSON.parse(data);
        let content = parsed?.message?.content?.parts[0] ?? "";

        for (let message of messages) {
          if (message.content === content) {
            content = "";
            break;
          }
        }

        if (content === "") return;

        if (stream) {
          let response = {
            id: requestId,
            created: created,
            object: "chat.completion.chunk",
            model: "gpt-3.5-turbo",
            choices: [
              {
                delta: {
                  content: content.replace(fullContent, ""),
                },
                index: 0,
                finish_reason: null,
              },
            ],
          };

          res.write(`data: ${JSON.stringify(response)}\n\n`);
        }

        fullContent = content.length > fullContent.length ? content : fullContent;
      } catch (error) {
        console.error("Error parsing chunk", error);
      }
    });

    response.data.on('end', () => {
      if (stream) {
        res.write(
          `data: ${JSON.stringify({
            id: requestId,
            created: created,
            object: "chat.completion.chunk",
            model: "gpt-3.5-turbo",
            choices: [
              {
                delta: {
                  content: "",
                },
                index: 0,
                finish_reason: "stop",
              },
            ],
          })}\n\n`
        );
      } else {
        res.json({
          id: requestId,
          created: created,
          model: "gpt-3.5-turbo",
          object: "chat.completion",
          choices: [
            {
              finish_reason: "stop",
              index: 0,
              message: {
                content: fullContent,
                role: "assistant",
              },
            },
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        });
      }
      
      res.end();
    });
  } catch (error) {
    console.error('Error:', error.message || 'Unknown error');
    res.status(500).json({ error: error.message || 'An unexpected error occurred' });
  }
}
