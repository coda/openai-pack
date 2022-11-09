import * as coda from "@codahq/packs-sdk";

export const pack = coda.newPack();

pack.setUserAuthentication({
  type: coda.AuthenticationType.HeaderBearerToken,
});

pack.addNetworkDomain("openai.com");

interface CompletionsRequest {
  model: string;
  prompt: string;
  max_tokens?: number;
  temperature?: number;
}

async function getCompletion(
  context: coda.ExecutionContext,
  request: CompletionsRequest
): Promise<string> {
  const resp = await context.fetcher.fetch({
    url: "https://api.openai.com/v1/completions",
    method: "POST",
    body: JSON.stringify(request),
    headers: { "Content-Type": "application/json" },
  });
  return resp.body.choices[0].text.trim();
}

const modelParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "model",
  description: "the GPT-3 model to use, can be ",
  optional: true,
  autocomplete: async () => {
    return [
      "text-davinci-002",
      "text-curie-001",
      "text-babbage-001",
      "text-ada-001",
    ];
  },
});
const numTokensParam = coda.makeParameter({
  type: coda.ParameterType.Number,
  name: "numTokens",
  description:
    "the maximum number of tokens for the completion to output. Defaults to 512. Maximum of 2048 for most models and 4000 for davinci",
  optional: true,
});
const temperatureParam = coda.makeParameter({
  type: coda.ParameterType.Number,
  name: "temperature",
  description:
    "the temperature for how creative GPT-3 is with the completion. Must be between 0.0 and 1.0. Defaults to 1.0.",
  optional: true,
});
const promptParam = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "prompt",
  description: "prompt",
});

pack.addFormula({
  name: "GPT3Prompt",
  description: "Complete text from a prompt",
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam],
  resultType: coda.ValueType.String,
  execute: async function (
    [prompt, model = "text-davinci-002", max_tokens = 512, temperature],
    context
  ) {
    if (prompt.length === 0) {
      return "";
    }

    const request = {
      model,
      prompt,
      max_tokens,
      temperature,
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

pack.addFormula({
  name: "GPT3PromptExamples",
  description: "Complete text from a prompt and a set of examples",
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "prompt",
      description: "prompt",
    }),
    coda.makeParameter({
      type: coda.ParameterType.StringArray,
      name: "trainingPrompts",
      description:
        "Example prompts. Should be the same length as `trainingResponses`",
    }),
    coda.makeParameter({
      type: coda.ParameterType.StringArray,
      name: "trainingResponses",
      description:
        "Example responses corresponding to `trainingPrompts`. Should be the same length.",
    }),
    modelParameter,
    numTokensParam,
    temperatureParam,
  ],
  resultType: coda.ValueType.String,
  execute: async function (
    [
      prompt,
      trainingPrompts,
      trainingResponses,
      model = "text-davinci-002",
      max_tokens = 512,
      temperature,
    ],
    context
  ) {
    coda.assertCondition(
      trainingPrompts.length === trainingResponses.length,
      "Must have same number of example prompts as example responses"
    );
    if (prompt.length === 0) {
      return "";
    }
    coda.assertCondition(
      trainingResponses.length > 0,
      "Please provide some training responses"
    );

    const exampleData = trainingPrompts
      .map((promptEx, i) => `${promptEx}\n${trainingResponses[i]}`)
      .join("```");

    const request = {
      model,
      prompt: exampleData + "```" + prompt + "\n",
      max_tokens,
      temperature,
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

pack.addFormula({
  name: "QuestionAnswer",
  description:
    "Answer a question, simply provide a natural language question that you might ask Google or Wikipedia",
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam],
  resultType: coda.ValueType.String,
  execute: async function (
    [prompt, model = "text-davinci-002", max_tokens = 128, temperature],
    context
  ) {
    if (prompt.length === 0) {
      return "";
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
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

pack.addFormula({
  name: "Summarize",
  description: "Summarize a large chunk of text",
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam],
  resultType: coda.ValueType.String,
  execute: async function (
    [prompt, model = "text-davinci-002", max_tokens = 64, temperature],
    context
  ) {
    if (prompt.length === 0) {
      return "";
    }

    const newPrompt = `${prompt}\ntldr;\n`;

    const request = {
      model,
      prompt: newPrompt,
      max_tokens,
      temperature,
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

pack.addFormula({
  name: "Keywords",
  description: "Extract keywords from a large chunk of text",
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam],
  resultType: coda.ValueType.String,
  execute: async function (
    [prompt, model = "text-davinci-002", max_tokens = 64, temperature],
    context
  ) {
    if (prompt.length === 0) {
      return "";
    }

    const newPrompt = `Extract keywords from this text:
${prompt}`;

    const request = {
      model,
      prompt: newPrompt,
      max_tokens,
      temperature,
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

pack.addFormula({
  name: "MoodToColor",
  description: "Generate a color for a mood",
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam],
  resultType: coda.ValueType.String,
  execute: async function (
    [prompt, model = "text-davinci-002", max_tokens = 6, temperature],
    context
  ) {
    if (prompt.length === 0) {
      return "";
    }

    const newPrompt = `The css code for a color like ${prompt}:
background-color: #`;

    const request = {
      model,
      prompt: newPrompt,
      max_tokens,
      temperature,
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

pack.addFormula({
  name: "SentimentClassifier",
  description:
    "Categorizes sentiment of text into positive, neutral, or negative",
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam],
  resultType: coda.ValueType.String,
  execute: async function (
    [prompt, model = "text-davinci-002", max_tokens = 20, temperature],
    context
  ) {
    if (prompt.length === 0) {
      return "";
    }

    const newPrompt = `Decide whether the text's sentiment is positive, neutral, or negative.
Text: ${prompt}
Sentiment: `;

    const request = {
      model,
      prompt: newPrompt,
      max_tokens,
      temperature,
    };

    const result = await getCompletion(context, request);

    return result;
  },
});

const styleParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "style",
  description:
    "the style to use for your image. If you provide this, you don't need to specify the style in the prompt",
  optional: true,
  autocomplete: async () => {
    return Object.keys(StyleNameToPrompt);
  },
});

const StyleNameToPrompt = {
  "Cave wall": "drawn on a cave wall",
  Basquiat: "in the style of Basquiat",
  "Digital art": "as digital art",
  Photorealistic: "in a photorealistic style",
  "Andy Warhol": "in the style of Andy Warhol",
  "Pencil drawing": "as a pencil drawing",
  "1990s Saturday morning cartoon": "as a 1990s Saturday morning cartoon",
  Steampunk: "in a steampunk style",
  Solarpunk: "in a solarpunk style",
  "Studio Ghibli": "in the style of Studio Ghibli",
  "Movie poster": "as a movie poster",
  "Book cover": "as a book cover",
  "Album cover": "as an album cover",
  "3D Icon": "as a 3D icon",
  "Ukiyo-e": "in the style of Ukiyo-e",
};

pack.addFormula({
  name: "CreateDalleImage",
  description: "Create image from prompt",
  cacheTtlSecs: 60 * 60,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "prompt",
      description: "prompt",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "size",
      description: "size",
      optional: true,
      autocomplete: async () => {
        return ["256x256", "512x512", "1024x1024"];
      },
    }),
    styleParameter,
  ],
  resultType: coda.ValueType.String,
  codaType: coda.ValueHintType.ImageReference,
  execute: async function ([prompt, size = "512x512", style], context) {
    if (prompt.length === 0) {
      return "";
    }

    const request = {
      size,
      prompt: style ? prompt + " " + StyleNameToPrompt[style] ?? style : prompt,
      response_format: "b64_json",
    };

    const resp = await context.fetcher.fetch({
      url: "https://api.openai.com/v1/images/generations",
      method: "POST",
      body: JSON.stringify(request),
      headers: { "Content-Type": "application/json" },
    });
    return `data:image/png;base64,${resp.body.data[0].b64_json}`;
  },
});
