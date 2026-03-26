const matchReply = () => ({
        message: expect.stringMatching(/.+/),
        result: expect.arrayContaining([
          expect.objectContaining({
            role: expect.stringMatching(/^(assistant)$/),
            content: expect.stringMatching(/.+/)
          })
        ]),
        tokens: expect.objectContaining({
          input: expect.toBeGreaterThan(0),
          output: expect.toBeGreaterThan(0),
          total: expect.toBeGreaterThan(0)
        }),
        uuid: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
        // New validation for JSON structure
        message: expect.stringMatching(/.+/)
      });

const matchToolReply = (name) => ({
        message: expect.anything(),
        result: expect.arrayContaining([
          expect.objectContaining({
            role: expect.stringMatching(/^(assistant)$/),
            tool_calls: expect.arrayContaining([
              expect.objectContaining({
                id: expect.stringMatching(/.+/),
                function: expect.objectContaining({
                  arguments: expect.stringMatching(/.+/),
                  name: expect.stringMatching(new RegExp(`^${name}$`))
                }),
              })
            ])
          }),
          expect.objectContaining({
            role: expect.stringMatching(/tool/),
            name: expect.stringMatching(new RegExp(`^${name}$`)),
            content: expect.stringMatching(/.+/),
            tool_call_id: expect.stringMatching(/.+/)
          }),
          expect.objectContaining({
            role: expect.stringMatching(/assistant/),
            content: expect.stringMatching(/.+/)
          })
        ]),
        tokens: expect.objectContaining({
          input: expect.toBeGreaterThan(0),
          output: expect.toBeGreaterThan(0),
          total: expect.toBeGreaterThan(0)
        }),
        uuid: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      });

const matchSchemaReply = (schema) => ({
        message: expect.toMatchSchema(schema),
        result: expect.arrayContaining([
          expect.objectContaining({
            role: expect.stringMatching(/^(assistant)$/),
            content: expect.stringMatching(/.+/)
          })
        ]),
        tokens: expect.objectContaining({
          input: expect.toBeGreaterThan(0),
          output: expect.toBeGreaterThan(0),
          total: expect.toBeGreaterThan(0)
        }),
        uuid: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      });

module.exports = { matchReply, matchToolReply, matchSchemaReply };