import http from "node:http";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { once } from "node:events";

export function validateBaseUrl(input) {
  const url = new URL(input);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" || url.protocol === "http:"
    )
  ) {
    throw new Error(
      "API 地址请使用 HTTP 或 HTTPS，可填写局域网服务。地址中不要包含 Key 或查询参数。",
    );
  }
  return url.href.replace(/\/+$/, "");
}

export function toChatRequest(request, profile, reasoning = new Map()) {
  const messages = [];
  if (request.instructions)
    messages.push({ role: "system", content: request.instructions });
  const input =
    typeof request.input === "string"
      ? [{ role: "user", content: request.input }]
      : request.input || [];
  for (const item of input) {
    if (item.type === "function_call" || item.type === "custom_tool_call") {
      const call = {
        id: item.call_id || item.id,
        type: "function",
        function: {
          name: item.name,
          arguments:
            item.type === "custom_tool_call"
              ? JSON.stringify({ input: item.input })
              : item.arguments || "{}",
        },
      };
      let last = messages.at(-1);
      if (last?.role !== "assistant" || !last.tool_calls) {
        last = { role: "assistant", content: null, tool_calls: [] };
        messages.push(last);
      }
      last.tool_calls.push(call);
      if (reasoning.has(call.id))
        last.reasoning_content = reasoning.get(call.id);
    } else if (
      item.type === "function_call_output" ||
      item.type === "custom_tool_call_output"
    ) {
      messages.push({
        role: "tool",
        tool_call_id: item.call_id,
        content:
          typeof item.output === "string"
            ? item.output
            : JSON.stringify(item.output),
      });
    } else if (item.role || item.type === "message") {
      const content =
        typeof item.content === "string"
          ? item.content
          : (item.content || []).flatMap((part) => {
              if (["input_text", "output_text", "text"].includes(part.type))
                return [{ type: "text", text: part.text || "" }];
              if (part.type === "input_image")
                return [
                  {
                    type: "image_url",
                    image_url: {
                      url: part.image_url,
                      detail: part.detail || "auto",
                    },
                  },
                ];
              return [];
            });
      messages.push({
        role: item.role === "developer" ? "system" : item.role || "user",
        content,
      });
    }
  }
  const result = {
    model: request.model || profile.models[0],
    messages,
    stream: false,
  };
  const tools = (request.tools || [])
    .filter((t) => ["function", "custom"].includes(t.type))
    .map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters:
          t.type === "custom"
            ? {
                type: "object",
                properties: {
                  input: {
                    type: "string",
                    description:
                      "The raw tool input, following the format described by the tool.",
                  },
                },
                required: ["input"],
                additionalProperties: false,
              }
            : t.parameters || { type: "object", properties: {} },
      },
    }));
  if (tools.length) {
    result.tools = tools;
    result.tool_choice =
      request.tool_choice?.type === "function"
        ? { type: "function", function: { name: request.tool_choice.name } }
        : typeof request.tool_choice === "string"
          ? request.tool_choice
          : "auto";
    result.parallel_tool_calls = request.parallel_tool_calls ?? false;
  }
  if (profile.reasoningParameter !== "omit" && request.reasoning?.effort)
    result.reasoning_effort = request.reasoning.effort;
  if (request.max_output_tokens) result.max_tokens = request.max_output_tokens;
  return result;
}

export function toResponse(
  completion,
  reasoning = new Map(),
  customTools = new Set(),
) {
  const message = completion.choices?.[0]?.message;
  if (!message)
    throw new Error("第三方 API 返回的结果缺少 choices[0].message。");
  const output = [];
  if (message.content)
    output.push({
      type: "message",
      id: `msg_${randomUUID()}`,
      role: "assistant",
      status: "completed",
      content: [
        {
          type: "output_text",
          text:
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content),
          annotations: [],
        },
      ],
    });
  for (const tool of message.tool_calls || []) {
    if (message.reasoning_content)
      reasoning.set(tool.id, message.reasoning_content);
    if (customTools.has(tool.function.name)) {
      const input = JSON.parse(tool.function.arguments || "{}").input;
      if (typeof input !== "string")
        throw new Error("自定义工具输入必须包含字符串 input。");
      output.push({
        type: "custom_tool_call",
        id: `ct_${randomUUID()}`,
        call_id: tool.id,
        name: tool.function.name,
        input,
        status: "completed",
      });
    } else
      output.push({
        type: "function_call",
        id: `fc_${randomUUID()}`,
        call_id: tool.id,
        name: tool.function.name,
        arguments: tool.function.arguments || "{}",
        status: "completed",
      });
  }
  while (reasoning.size > 1000) reasoning.delete(reasoning.keys().next().value);
  return {
    id: `resp_${randomUUID()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: completion.model,
    output,
    error: null,
    incomplete_details: null,
    usage: {
      input_tokens: completion.usage?.prompt_tokens || 0,
      output_tokens: completion.usage?.completion_tokens || 0,
      total_tokens: completion.usage?.total_tokens || 0,
      input_tokens_details: {
        cached_tokens:
          completion.usage?.prompt_tokens_details?.cached_tokens || 0,
      },
      output_tokens_details: {
        reasoning_tokens:
          completion.usage?.completion_tokens_details?.reasoning_tokens || 0,
      },
    },
  };
}

export function responseEvents(response) {
  const events = [];
  let sequence = 0;
  const add = (type, values) =>
    events.push({ type, sequence_number: sequence++, ...values });
  const initial = {
    ...response,
    status: "in_progress",
    output: [],
    usage: null,
  };
  add("response.created", { response: initial });
  add("response.in_progress", { response: initial });
  response.output.forEach((item, output_index) => {
    add("response.output_item.added", {
      output_index,
      item: {
        ...item,
        status: "in_progress",
        ...(item.type === "message"
          ? { content: [] }
          : item.type === "custom_tool_call"
            ? { input: "" }
            : { arguments: "" }),
      },
    });
    if (item.type === "message") {
      const content = { item_id: item.id, output_index, content_index: 0 };
      add("response.content_part.added", {
        ...content,
        part: { type: "output_text", text: "", annotations: [] },
      });
      add("response.output_text.delta", {
        ...content,
        delta: item.content[0].text,
      });
      add("response.output_text.done", {
        ...content,
        text: item.content[0].text,
      });
      add("response.content_part.done", { ...content, part: item.content[0] });
    } else if (item.type === "custom_tool_call") {
      add("response.custom_tool_call_input.delta", {
        item_id: item.id,
        output_index,
        delta: item.input,
      });
      add("response.custom_tool_call_input.done", {
        item_id: item.id,
        output_index,
        input: item.input,
      });
    } else {
      add("response.function_call_arguments.delta", {
        item_id: item.id,
        output_index,
        delta: item.arguments,
      });
      add("response.function_call_arguments.done", {
        item_id: item.id,
        output_index,
        arguments: item.arguments,
      });
    }
    add("response.output_item.done", { output_index, item });
  });
  add("response.completed", { response });
  return events;
}

export async function createChatAdapter(profile, { fetchImpl = fetch } = {}) {
  const secret = randomBytes(32).toString("hex");
  const reasoning = new Map();
  const controllers = new Set();
  const server = http.createServer(async (req, res) => {
    const token = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (
      token.length !== expected.length ||
      !timingSafeEqual(token, expected) ||
      req.headers.origin
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    const json = (code, value) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (
      req.method !== "POST" ||
      !["/v1/responses", "/responses"].includes(req.url)
    ) {
      json(404, { error: { message: "Unknown endpoint" } });
      return;
    }
    const controller = new AbortController();
    controllers.add(controller);
    res.on("close", () => controller.abort());
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 24 * 1024 * 1024) throw new Error("请求超过 24 MB。");
        chunks.push(chunk);
      }
      const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (request.previous_response_id)
        throw new Error(
          "当前 Chat Completions 适配器需要完整对话输入，不支持 previous_response_id。",
        );
      const upstream = await fetchImpl(
        `${validateBaseUrl(profile.baseUrl)}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(profile.apiKey
              ? { Authorization: `Bearer ${profile.apiKey}` }
              : {}),
          },
          body: JSON.stringify(toChatRequest(request, profile, reasoning)),
          redirect: "follow",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(240000),
          ]),
        },
      );
      if (!upstream.ok) {
        // Upstream error bodies can echo credentials. Return the status without forwarding the body.
        json(upstream.status, {
          error: {
            message: `第三方 Chat Completions API 返回 HTTP ${upstream.status}，请检查地址、模型、Key 和思考参数。`,
            type: "upstream_error",
          },
        });
        return;
      }
      const customTools = new Set(
        (request.tools || [])
          .filter((t) => t.type === "custom")
          .map((t) => t.name),
      );
      const response = toResponse(
        await upstream.json(),
        reasoning,
        customTools,
      );
      if (!request.stream) {
        json(200, response);
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      });
      for (const event of responseEvents(response))
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
    } catch (error) {
      if (!res.headersSent && !res.destroyed)
        json(502, {
          error: {
            message:
              error.name === "TimeoutError"
                ? "第三方 API 请求超时。"
                : "第三方 API 调用失败，请检查服务地址与协议设置。",
            type: "adapter_error",
          },
        });
      else res.end();
    } finally {
      controllers.delete(controller);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    apiKey: secret,
    close() {
      for (const controller of controllers) controller.abort();
      server.close();
      server.closeAllConnections();
    },
  };
}

export async function createResponsesAdapter(
  profile,
  { fetchImpl = fetch, idleTimeoutMs = 240000 } = {},
) {
  const secret = randomBytes(32).toString("hex");
  const controllers = new Set();
  const server = http.createServer(async (req, res) => {
    const actual = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected) ||
      req.headers.origin
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (
      req.method !== "POST" ||
      !["/v1/responses", "/responses"].includes(req.url)
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    const controller = new AbortController();
    controllers.add(controller);
    res.on("close", () => controller.abort());
    let idleTimer;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), idleTimeoutMs);
      idleTimer.unref();
    };
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 24 * 1024 * 1024) throw new Error("Request too large");
        chunks.push(chunk);
      }
      const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (profile.reasoningParameter === "omit") delete request.reasoning;
      resetIdle();
      const upstream = await fetchImpl(
        `${validateBaseUrl(profile.baseUrl)}/responses`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(profile.apiKey
              ? { Authorization: `Bearer ${profile.apiKey}` }
              : {}),
          },
          body: JSON.stringify(request),
          redirect: "follow",
          signal: controller.signal,
        },
      );
      resetIdle();
      if (!upstream.ok) {
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              message: `第三方 Responses API 返回 HTTP ${upstream.status}，请检查服务配置。`,
            },
          }),
        );
        return;
      }
      res.writeHead(200, {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-cache",
      });
      for await (const chunk of upstream.body) {
        resetIdle();
        if (!res.write(chunk))
          await once(res, "drain", { signal: controller.signal });
      }
      res.end();
    } catch {
      if (!res.headersSent)
        res.writeHead(502, { "Content-Type": "application/json" });
      if (!res.destroyed)
        res.end(
          JSON.stringify({
            error: {
              message: "第三方 Responses API 调用失败，请检查服务地址和网络。",
            },
          }),
        );
    } finally {
      clearTimeout(idleTimer);
      controllers.delete(controller);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    apiKey: secret,
    close() {
      for (const controller of controllers) controller.abort();
      server.close();
      server.closeAllConnections();
    },
  };
}
