// PLEASE READ BEFORE CONTRIBUTING
// We want to keep Pack code here so that it's available via the Source Code tab in the listing page.
// However, we want to keep it in sync with the https://github.com/coda/openai-pack repository.
// Please copy the changes you make here to the repository and verify diffs are only what you did,
// otherwise raise in #story-openai-pack

import * as coda from '@codahq/packs-sdk';

export const pack = coda.newPack();

const DEFAULT_MODEL = 'gpt-4o-mini';

const MODEL_LISTS = {
  // Original models in exact order for backward compatibility
  original: [
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-instruct',
    'gpt-3.5-turbo-16k',
    'gpt-4',
    'gpt-4-32k',
  ],
  // New models added for expansion
  new: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-5',
    'gpt-5-mini',
    'o1',
    'o1-mini',
    'o3-mini',
  ],
  // Vision-capable models
  vision: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-5',
    'gpt-4-vision-preview',
    'gpt-4-turbo'
  ],
  // Models that use max_completion_tokens instead of max_tokens
  newTokenModels: ['gpt-5', 'gpt-4.1', 'o1', 'o3', 'o4-mini'],
  // Chat completion models for detection
  newChatModels: [
    'gpt-5', 'gpt-4.1', 'gpt-4o', 'chatgpt-4o', 'o1', 'o3', 'o4-mini'
  ]
};

pack.setUserAuthentication({
  type: coda.AuthenticationType.HeaderBearerToken,
  instructionsUrl: 'https://platform.openai.com/account/api-keys',
});

pack.addNetworkDomain('openai.com');

interface CompletionsRequest {
  model: string;
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  stop?: string[];
}

interface ChatCompletionMessage {
  role: 'system' | 'user';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  max_tokens?: number;
  temperature?: number;
  stop?: string[];
}

function isChatCompletionModel(model: string): boolean {
  // Also works with snapshot model like `gpt-3.5-turbo-0301` & `gpt-4-0314`
  if (!model.includes('gpt-3.5-turbo-instruct') && (model.includes('gpt-3.5-turbo') || model.includes('gpt-4'))) {
    return true;
  }

  return MODEL_LISTS.newChatModels.some(newModel => model.includes(newModel));
}

function usesMaxCompletionTokens(model: string): boolean {
  return MODEL_LISTS.newTokenModels.some(newModel => model.includes(newModel));
}

function buildRequestWithCompatibleParams(baseRequest: any): any {
  if (!baseRequest.max_tokens || !usesMaxCompletionTokens(baseRequest.model)) {
    return baseRequest;
  }

  // Convert max_tokens to max_completion_tokens for newer models
  const compatibleRequest = { ...baseRequest };
  compatibleRequest.max_completion_tokens = compatibleRequest.max_tokens;
  delete compatibleRequest.max_tokens;
  return compatibleRequest;
}

async function getChatCompletion(context: coda.ExecutionContext, request: ChatCompletionRequest): Promise<string> {
  const compatibleRequest = buildRequestWithCompatibleParams(request);

  const resp = await context.fetcher.fetch({
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    body: JSON.stringify(compatibleRequest),
    headers: {'Content-Type': 'application/json'},
  });
  return resp.body.choices[0].message.content.trim();
}

async function getCompletion(context: coda.ExecutionContext, request: CompletionsRequest): Promise<string> {
  try {
    // Call Chat Completion API if the model is a chat completion model.
    if (isChatCompletionModel(request.model)) {
      return getChatCompletion(context, {
        model: request.model,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        messages: [{role: 'user', content: request.prompt}],
      });
    }

    const compatibleRequest = buildRequestWithCompatibleParams(request);

    const resp = await context.fetcher.fetch({
      url: 'https://api.openai.com/v1/completions',
      method: 'POST',
      body: JSON.stringify(compatibleRequest),
      headers: {'Content-Type': 'application/json'},
    });
    return resp.body.choices[0].text.trim();
  } catch (err: any) {
    if (err.statusCode === 429 && err.type === 'insufficient_quota') {
      throw new coda.UserVisibleError(
        "You've exceed your current OpenAI API quota. Please check your plan and billing details. For help, see https://help.openai.com/en/articles/6891831-error-code-429-you-exceeded-your-current-quota-please-check-your-plan-and-billing-details",
      );
    }

    throw err;
  }
}

const promptParam = coda.makeParameter({
  type: coda.ParameterType.String,
  name: 'prompt',
  description: 'prompt',
});

const modelParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: 'model',
  description:
    "The AI model to process your request. Defaults to gpt-4o-mini (recommended: 60% cheaper than GPT-3.5, better quality). For premium: gpt-4o, gpt-4.1, or gpt-5. Legacy: gpt-3.5-turbo-instruct. See https://platform.openai.com/docs/models",
  optional: true,
  autocomplete: [
    ...MODEL_LISTS.original,
    ...MODEL_LISTS.new,
  ],
});

const numTokensParam = coda.makeParameter({
  type: coda.ParameterType.Number,
  name: 'numTokens',
  description:
    'Maximum tokens in the response. Generous defaults prevent truncation (1536 for most formulas). Latest models support 128K+ context and 16K+ output tokens.',
  optional: true,
});

const temperatureParam = coda.makeParameter({
  type: coda.ParameterType.Number,
  name: 'temperature',
  description:
    'Controls creativity/randomness. 0.0 = focused/deterministic, 1.0 = creative/varied. Range: 0.0-1.0. Defaults to 1.0.',
  optional: true,
});

const systemPromptParam = coda.makeParameter({
  type: coda.ParameterType.String,
  name: 'systemPrompt',
  description: "Optional. Helps define the behavior of the assistant. e.g. 'You are a helpful assistant.'",
  optional: true,
});

const stopParam = coda.makeParameter({
  type: coda.ParameterType.StringArray,
  name: 'stop',
  description: 'Optional. Up to 4 sequences where the API will stop generating further tokens.',
  optional: true,
});

const commonPromptParams = {
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  onError: handleError,
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 1536, temperature, stop], context) {
    if (prompt.length === 0) {
      return '';
    }

    const request = {
      model,
      prompt,
      max_tokens,
      temperature,
      stop,
    };

    const result = await getCompletion(context, request);
    return result;
  },
};

pack.addFormula({
  name: 'ChatCompletion',
  description:
    'Advanced AI chat with system prompt support. Uses GPT-4o-mini by default (cost-effective, high quality). Supports latest models including GPT-5, GPT-4.1, GPT-4o with vision capabilities.',
  parameters: [promptParam, systemPromptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  onError: handleError,
  execute: async function (
    [userPrompt, systemPrompt, model = 'gpt-4o-mini', maxTokens = 1536, temperature, stop],
    context,
  ) {
    coda.assertCondition(isChatCompletionModel(model), 'Must use chat completion models (gpt-3.5-turbo, gpt-4, gpt-4o, gpt-5, etc.) for this formula.');

    if (userPrompt.length === 0) {
      return '';
    }

    const messages: ChatCompletionMessage[] = [];

    if (systemPrompt && systemPrompt.length > 0) {
      messages.push({role: 'system', content: systemPrompt});
    }

    messages.push({role: 'user', content: userPrompt});

    const request = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stop,
    };

    const result = await getChatCompletion(context, request);

    return result;
  },
});

pack.addFormula({
  name: 'GPT3Prompt',
  description: 'Complete text from a prompt',
  ...commonPromptParams,
  isExperimental: true,
} as any);

pack.addFormula({
  name: 'Prompt',
  description: 'Complete text from a prompt. Supports all models including GPT-5, GPT-4.1, GPT-4o. Generous 1536 token default prevents truncation.',
  ...commonPromptParams,
} as any);

pack.addFormula({
  name: 'AnswerPrompt',
  description:
    'Complete text from a prompt as an action. Use in tables with result columns. Supports latest models with generous token limits (1536 default).',
  ...commonPromptParams,
  isAction: true,
} as any);

pack.addFormula({
  name: 'GPT3PromptExamples',
  description: 'Few-shot learning: provide examples to guide AI responses. Works with all models. 1536 token default for detailed examples.',
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: 'prompt',
      description: 'prompt',
    }),
    coda.makeParameter({
      type: coda.ParameterType.StringArray,
      name: 'trainingPrompts',
      description: 'Example prompts. Should be the same length as `trainingResponses`',
    }),
    coda.makeParameter({
      type: coda.ParameterType.StringArray,
      name: 'trainingResponses',
      description: 'Example responses corresponding to `trainingPrompts`. Should be the same length.',
    }),
    modelParameter,
    numTokensParam,
    temperatureParam,
    stopParam,
  ],
  resultType: coda.ValueType.String,
  onError: handleError,
  execute: async function (
    [prompt, trainingPrompts, trainingResponses, model = DEFAULT_MODEL, max_tokens = 1536, temperature, stop],
    context,
  ) {
    coda.assertCondition(
      trainingPrompts.length === trainingResponses.length,
      'Must have same number of example prompts as example responses',
    );
    if (prompt.length === 0) {
      return '';
    }
    coda.assertCondition(trainingResponses.length > 0, 'Please provide some training responses');

    const exampleData = trainingPrompts.map((promptEx, i) => `${promptEx}\n${trainingResponses[i]}`).join('```');

    const request = {
      model,
      prompt: exampleData + '```' + prompt + '\n',
      max_tokens,
      temperature,
      stop,
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

pack.addFormula({
  name: 'QuestionAnswer',
  description: 'Intelligent Q&A system with built-in fact checking. Returns "Unknown" for nonsensical questions. 384 token limit for detailed answers.',
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  onError: handleError,
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 384, temperature, stop], context) {
    if (prompt.length === 0) {
      return '';
    }

    const newPrompt = `I am a highly intelligent question answering bot. If you ask me a question that is rooted in truth, I will give you the answer. If you ask me a question that is nonsense, trickery, or has no clear answer, I will respond with "Unknown".

Q: What is human life expectancy in the United States?
A: Human life expectancy in the United States is 78 years.

Q: Who was president of the United States in 1955?
A: Dwight D. Eisenhower was president of the United States in 1955.

Q: Which party did he belong to?
A: He belonged to the Republican Party.

Q: What is the square root of banana?
A: Unknown

Q: How does a telescope work?
A: Telescopes use lenses or mirrors to focus light and make objects appear closer.

Q: Where were the 1992 Olympics held?
A: The 1992 Olympics were held in Barcelona, Spain.

Q: How many squigs are in a bonk?
A: Unknown

Q: ${prompt}
A: `;

    const request = {
      model,
      prompt: newPrompt,
      max_tokens,
      temperature,
      stop,
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

pack.addFormula({
  name: 'Summarize',
  description: 'Generate concise summaries of long text. 192 token limit for detailed summaries without truncation.',
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  onError: handleError,
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 192, temperature, stop], context) {
    if (prompt.length === 0) {
      return '';
    }

    const newPrompt = `${prompt}\ntldr;\n`;

    const request = {
      model,
      prompt: newPrompt,
      max_tokens,
      temperature,
      stop,
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

pack.addFormula({
  name: 'Keywords',
  description: 'Extract key terms and phrases from text. 192 token limit allows comprehensive keyword extraction.',
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  onError: handleError,
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 192, temperature, stop], context) {
    if (prompt.length === 0) {
      return '';
    }

    const newPrompt = `Extract keywords from this text:
${prompt}`;

    const request = {
      model,
      prompt: newPrompt,
      max_tokens,
      temperature,
      stop,
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

pack.addFormula({
  name: 'MoodToColor',
  description: 'Convert mood/emotion descriptions into CSS hex color codes. Returns colors that represent the feeling.',
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  onError: handleError,
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 10, temperature, stop], context) {
    if (prompt.length === 0) {
      return '';
    }

    const newPrompt = `Answer with hex code only. The css code for a color like ${prompt}:
background-color: #`;

    const request = {
      model,
      prompt: newPrompt,
      max_tokens,
      temperature,
      stop,
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

pack.addFormula({
  name: 'SentimentClassifier',
  description: 'Analyze text sentiment: returns "positive", "neutral", or "negative". Fast classification with 30 token limit.',
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  onError: handleError,
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 30, temperature, stop], context) {
    if (prompt.length === 0) {
      return '';
    }

    const newPrompt = `Decide whether the text's sentiment is positive, neutral, or negative.
Text: ${prompt}
Sentiment: `;

    const request = {
      model,
      prompt: newPrompt,
      max_tokens,
      temperature,
      stop,
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

const StyleNameToPrompt = {
  'Cave wall': 'drawn on a cave wall',
  Basquiat: 'in the style of Basquiat',
  'Digital art': 'as digital art',
  Photorealistic: 'in a photorealistic style',
  'Andy Warhol': 'in the style of Andy Warhol',
  'Pencil drawing': 'as a pencil drawing',
  '1990s Saturday morning cartoon': 'as a 1990s Saturday morning cartoon',
  Steampunk: 'in a steampunk style',
  Solarpunk: 'in a solarpunk style',
  'Studio Ghibli': 'in the style of Studio Ghibli',
  'Movie poster': 'as a movie poster',
  'Book cover': 'as a book cover',
  'Album cover': 'as an album cover',
  '3D Icon': 'as a 3D icon',
  'Ukiyo-e': 'in the style of Ukiyo-e',
};

const styleParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: 'style',
  description:
    "the style to use for your image. If you provide this, you don't need to specify the style in the prompt",
  optional: true,
  autocomplete: Object.keys(StyleNameToPrompt),
});

pack.addFormula({
  name: 'CreateDalleImage',
  description: 'Generate images from text prompts using DALL-E 2. Supports multiple sizes and artistic styles. Reliable and cost-effective.',
  cacheTtlSecs: 60 * 60,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: 'prompt',
      description: 'prompt',
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: 'size',
      description: 'size',
      optional: true,
      autocomplete: ['256x256', '512x512', '1024x1024'],
    }),
    styleParameter,
    coda.makeParameter({
      type: coda.ParameterType.Boolean,
      name: 'temporaryUrl',
      description: 'Return a temporary URL that expires after an hour. Useful for adding the image to an Image column, because the default data URIs are too long.',
      optional: true,
    }),
  ],
  resultType: coda.ValueType.String,
  codaType: coda.ValueHintType.ImageReference,
  onError: handleError,
  execute: async function ([prompt, size = '512x512', style, temporaryUrl], context) {
    if (prompt.length === 0) {
      return '';
    }

    const request = {
      model: 'dall-e-2',
      size,
      prompt: style ? prompt + ' ' + (StyleNameToPrompt[style] ?? style) : prompt,
      response_format: temporaryUrl ? 'url' : 'b64_json',
    };

    const resp = await context.fetcher.fetch({
      url: 'https://api.openai.com/v1/images/generations',
      method: 'POST',
      body: JSON.stringify(request),
      headers: {'Content-Type': 'application/json'},
    });
    if (temporaryUrl) {
      return resp.body.data[0].url;
    } else {
      return `data:image/png;base64,${resp.body.data[0].b64_json}`;
    }
  },
});

interface VisionChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{type: string; text?: string; image_url?: {url: string; detail?: string}}>;
}

function isVisionCapableModel(model: string): boolean {
  return MODEL_LISTS.vision.some(visionModel => model.includes(visionModel));
}

function validateImageUrl(imageUrl: string): void {
  if (!imageUrl || imageUrl.trim().length === 0) {
    throw new coda.UserVisibleError('Image URL cannot be empty.');
  }

  const isDataUri = imageUrl.startsWith('data:image/');
  const isHttpUrl = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');

  if (!isDataUri && !isHttpUrl) {
    throw new coda.UserVisibleError(
      'Image URL must be either a valid HTTP/HTTPS URL or a data URI (data:image/png;base64,...).'
    );
  }

  if (isDataUri) {
    const supportedFormats = ['png', 'jpeg', 'jpg', 'gif', 'webp'];
    const formatMatch = imageUrl.match(/^data:image\/([^;]+);base64,/);

    if (!formatMatch) {
      throw new coda.UserVisibleError(
        'Data URI must be in format: data:image/[format];base64,[data]. Supported formats: PNG, JPEG, JPG, GIF, WebP.'
      );
    }

    const format = formatMatch[1].toLowerCase();
    if (!supportedFormats.includes(format)) {
      throw new coda.UserVisibleError(
        `Unsupported image format: ${format}. Supported formats: PNG, JPEG, JPG, GIF, WebP.`
      );
    }

    const base64Data = imageUrl.split(',')[1];
    if (!base64Data || base64Data.length === 0) {
      throw new coda.UserVisibleError('Data URI contains no image data after base64 marker.');
    }
  }

  if (isHttpUrl) {
    const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
    if (!urlPattern.test(imageUrl)) {
      throw new coda.UserVisibleError('Invalid HTTP/HTTPS URL format.');
    }
  }
}

async function getVisionChatCompletion(context: coda.ExecutionContext, model: string, messages: VisionChatCompletionMessage[], maxTokens?: number, temperature?: number): Promise<string> {
  const request: any = { model, messages };

  if (maxTokens) {
    if (usesMaxCompletionTokens(model)) {
      request.max_completion_tokens = maxTokens;
    } else {
      request.max_tokens = maxTokens;
    }
  }

  if (temperature !== undefined) {
    request.temperature = temperature;
  }

  try {
    const resp = await context.fetcher.fetch({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      body: JSON.stringify(request),
      headers: {'Content-Type': 'application/json'},
    });
    return resp.body.choices[0].message.content?.trim() || '';
  } catch (err: any) {
    if (err.statusCode === 429 && err.type === 'insufficient_quota') {
      throw new coda.UserVisibleError(
        "You've exceed your current OpenAI API quota. Please check your plan and billing details. For help, see https://help.openai.com/en/articles/6891831-error-code-429-you-exceeded-your-current-quota-please-check-your-plan-and-billing-details",
      );
    }

    throw err;
  }
}

pack.addFormula({
  name: 'AnalyzeImage',
  description: 'Analyze images using GPT-4 Vision. Extract text (OCR), describe images, answer questions about visual content.',
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: 'imageUrl',
      description: 'URL of the image to analyze, or data URI (data:image/png;base64,...)',
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: 'prompt',
      description: 'Question or instruction about the image. For OCR, use: "Extract all text from this image"',
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: 'model',
      description: 'Vision-capable model to use',
      optional: true,
      autocomplete: MODEL_LISTS.vision,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: 'detail',
      description: 'Image analysis detail level: low (faster), high (more detailed), auto (balanced)',
      optional: true,
      autocomplete: ['auto', 'low', 'high']
    }),
    coda.makeParameter({
      type: coda.ParameterType.Number,
      name: 'maxTokens',
      description: 'Maximum tokens for response (default 1000)',
      optional: true,
    }),
  ],
  resultType: coda.ValueType.String,
  onError: handleError,
  execute: async function ([imageUrl, prompt, model = 'gpt-4o', detail = 'auto', maxTokens = 1000], context) {
    coda.assertCondition(isVisionCapableModel(model), `Model '${model}' doesn't support vision. Use gpt-4o, gpt-4.1, gpt-5, or gpt-4-vision-preview.`);

    if (!prompt || prompt.trim().length === 0) {
      throw new coda.UserVisibleError('Prompt is required. Please provide instructions or a question about the image.');
    }

    validateImageUrl(imageUrl);

    const messages: VisionChatCompletionMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: detail as 'low' | 'high' | 'auto',
            },
          },
        ],
      },
    ];

    const result = await getVisionChatCompletion(context, model, messages, maxTokens);
    return result;
  },
});

pack.addFormula({
  name: 'ExtractTextOCR',
  description: 'Extract all text from images using advanced OCR capabilities via GPT-4 Vision.',
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: 'imageUrl',
      description: 'URL of the image containing text to extract, or data URI',
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: 'model',
      description: 'Vision-capable model for OCR (gpt-4o recommended for best accuracy)',
      optional: true,
      autocomplete: MODEL_LISTS.vision.filter(model =>
        ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-5'].some(preferred => model.includes(preferred))
      ),
    }),
  ],
  resultType: coda.ValueType.String,
  onError: handleError,
  execute: async function ([imageUrl, model = 'gpt-4o'], context) {
    coda.assertCondition(isVisionCapableModel(model), `Model '${model}' doesn't support vision. Use gpt-4o, gpt-4.1, gpt-5, or gpt-4-vision-preview for OCR.`);

    validateImageUrl(imageUrl);

    return pack.formulas.find(f => f.name === 'AnalyzeImage')!.execute([
      imageUrl,
      'Extract all text from this image. Return only the text content, preserving original formatting and structure as much as possible. Do not add commentary or descriptions.',
      model,
      'high', // Use high detail for better OCR accuracy
      1500     // More tokens for longer text extraction
    ], context) as string;
  },
});

// ADDITION: New CreateImageDALLE3 formula (separate from original CreateDalleImage)
pack.addFormula({
  name: 'CreateImageDALLE3',
  description: 'Generate images using DALL-E 3 with enhanced quality, better prompt following, and larger sizes.',
  cacheTtlSecs: 60 * 60,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: 'prompt',
      description: 'Detailed description of the image to generate',
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: 'size',
      description: 'Image size for DALL-E 3',
      optional: true,
      autocomplete: ['1024x1024', '1024x1792', '1792x1024'],
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: 'quality',
      description: 'Image quality level',
      optional: true,
      autocomplete: ['standard', 'hd']
    }),
    styleParameter,
    coda.makeParameter({
      type: coda.ParameterType.Boolean,
      name: 'temporaryUrl',
      description: 'Return temporary URL (expires in 1 hour) instead of data URI for easier embedding',
      optional: true,
    }),
  ],
  resultType: coda.ValueType.String,
  codaType: coda.ValueHintType.ImageReference,
  onError: handleError,
  execute: async function ([prompt, size = '1024x1024', quality = 'standard', style, temporaryUrl], context) {
    if (prompt.length === 0) {
      return '';
    }

    const styledPrompt = style ? prompt + ' ' + (StyleNameToPrompt[style] ?? style) : prompt;

    const request = {
      model: 'dall-e-3',
      prompt: styledPrompt,
      size,
      quality,
      response_format: temporaryUrl ? 'url' : 'b64_json',
    };

    const resp = await context.fetcher.fetch({
      url: 'https://api.openai.com/v1/images/generations',
      method: 'POST',
      body: JSON.stringify(request),
      headers: {'Content-Type': 'application/json'},
    });

    if (temporaryUrl) {
      return resp.body.data[0].url;
    } else {
      return `data:image/png;base64,${resp.body.data[0].b64_json}`;
    }
  },
});

function handleError(error: Error) {
  if (coda.StatusCodeError.isStatusCodeError(error)) {
    // Cast the error as a StatusCodeError, for better intellisense.
    let statusError = error as coda.StatusCodeError;
    let message = statusError.body?.error?.message;

    // If the API returned a 400 error with message, show it to the user.
    if (statusError.statusCode === 400 && message) {
      if (message) {
        throw new coda.UserVisibleError(message);
      }
    }
  }
  // The request failed for some other reason. Re-throw the error so that it
  // bubbles up.
  throw error;
}