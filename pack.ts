import * as coda from '@codahq/packs-sdk';

export const pack = coda.newPack();

const DEFAULT_MODEL = 'text-ada-001';

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
  return model.includes('gpt-3.5-turbo') || model.includes('gpt-4');
}

async function getChatCompletion(context: coda.ExecutionContext, request: ChatCompletionRequest): Promise<string> {
  const resp = await context.fetcher.fetch({
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    body: JSON.stringify(request),
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

    const resp = await context.fetcher.fetch({
      url: 'https://api.openai.com/v1/completions',
      method: 'POST',
      body: JSON.stringify(request),
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
    "the GPT-3 model to process your request. If you don't specify a model, it defaults to text-ada-001, which is the fastest and lowest cost. For higher quality generation, consider text-davinci-003. For more information, see https://platform.openai.com/docs/models/overview.",
  optional: true,
  autocomplete: async () => {
    return [
      'text-davinci-003',
      'text-davinci-002',
      'text-curie-001',
      'text-babbage-001',
      'text-ada-001',
      'gpt-3.5-turbo',
      'gpt-4',
      'gpt-4-32k',
    ];
  },
});

const numTokensParam = coda.makeParameter({
  type: coda.ParameterType.Number,
  name: 'numTokens',
  description:
    'the maximum number of tokens for the completion to output. Defaults to 512. Maximum of 2048 for most models and 4000 for davinci',
  optional: true,
});

const temperatureParam = coda.makeParameter({
  type: coda.ParameterType.Number,
  name: 'temperature',
  description:
    'the temperature for how creative GPT-3 is with the completion. Must be between 0.0 and 1.0. Defaults to 1.0.',
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
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 512, temperature, stop], context) {
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
    'Takes prompt as input, and return a model-generated message as output. Optionally, you can provide a system message to control the behavior of the chatbot.',
  parameters: [promptParam, systemPromptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  execute: async function (
    [userPrompt, systemPrompt, model = 'gpt-3.5-turbo', maxTokens = 512, temperature, stop],
    context,
  ) {
    coda.assertCondition(isChatCompletionModel(model), 'Must use `gpt-3.5-turbo`-related models for this formula.');

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
  description: 'Complete text from a prompt',
  ...commonPromptParams,
} as any);

pack.addFormula({
  name: 'AnswerPrompt',
  description:
    'Complete text from a prompt, outputs the result from the action. This should only be used in a table in combination with outputting the result to a result column; otherwise, it takes no effect.',
  ...commonPromptParams,
  isAction: true,
} as any);

pack.addFormula({
  name: 'GPT3PromptExamples',
  description: 'Complete text from a prompt and a set of examples',
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
  execute: async function (
    [prompt, trainingPrompts, trainingResponses, model = DEFAULT_MODEL, max_tokens = 512, temperature, stop],
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
  description: 'Answer a question, simply provide a natural language question that you might ask Google or Wikipedia',
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 128, temperature, stop], context) {
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
  description: 'Summarize a large chunk of text',
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 64, temperature, stop], context) {
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
  description: 'Extract keywords from a large chunk of text',
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 64, temperature, stop], context) {
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
  description: 'Generate a color for a mood',
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 6, temperature, stop], context) {
    if (prompt.length === 0) {
      return '';
    }

    const newPrompt = `The css code for a color like ${prompt}:
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
  description: 'Categorizes sentiment of text into positive, neutral, or negative',
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 20, temperature, stop], context) {
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

const styleParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: 'style',
  description:
    "the style to use for your image. If you provide this, you don't need to specify the style in the prompt",
  optional: true,
  autocomplete: async () => {
    return Object.keys(StyleNameToPrompt);
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

pack.addFormula({
  name: 'CreateDalleImage',
  description: 'Create image from prompt',
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
      autocomplete: async () => {
        return ['256x256', '512x512', '1024x1024'];
      },
    }),
    styleParameter,
  ],
  resultType: coda.ValueType.String,
  codaType: coda.ValueHintType.ImageReference,
  execute: async function ([prompt, size = '512x512', style], context) {
    if (prompt.length === 0) {
      return '';
    }

    const request = {
      size,
      prompt: style ? prompt + ' ' + StyleNameToPrompt[style] ?? style : prompt,
      response_format: 'b64_json',
    };

    const resp = await context.fetcher.fetch({
      url: 'https://api.openai.com/v1/images/generations',
      method: 'POST',
      body: JSON.stringify(request),
      headers: {'Content-Type': 'application/json'},
    });
    return `data:image/png;base64,${resp.body.data[0].b64_json}`;
  },
});
