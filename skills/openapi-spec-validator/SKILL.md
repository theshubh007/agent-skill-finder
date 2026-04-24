---
id: openapi-spec-validator
name: OpenAPI Spec Validator
version: 1.0.0
description: >
  Validates an OpenAPI 3.x or Swagger 2.0 specification file (YAML or JSON)
  against the official schema, returning a list of validation errors with path,
  message, and severity. Checks for missing required fields, invalid $ref
  references, malformed response schemas, and security scheme misconfigurations.
  Returns valid=true when the spec has zero errors.
capability:
  type: code-execution
  inputs:
    - "spec_path:string"
    - "strict:boolean"
  outputs:
    - "errors:list"
    - "warnings:list"
    - "error_count:int"
    - "valid:boolean"
graph:
  depends_on: []
  complements: ["api-mock-generator", "sdk-code-generator"]
  co_used_with: ["postman-collection-exporter", "api-doc-publisher"]
compatibility:
  claude_code: true
  gemini: true
  codex: true
  cursor: true
  mcp: true
risk: safe
---

## What this skill does

Parses an OpenAPI 3.x or Swagger 2.0 spec file and runs full schema validation
using the official OpenAPI JSON Schema. Returns every error with the JSON path
where it occurred, a human-readable message, and the severity level. In strict
mode, also validates that all `$ref` references resolve and that every endpoint
has at least one documented response.

## Inputs

- `spec_path` — path to the `.yaml`, `.yml`, or `.json` spec file
- `strict` — when `true`, enables additional checks: unresolved `$ref`, undocumented endpoints, missing example values (default: `false`)

## Outputs

- `errors` — list of `{path, message, severity}` objects for spec violations (severity: `error`)
- `warnings` — list of `{path, message, severity}` objects for best-practice issues (severity: `warning`)
- `error_count` — number of error-severity violations
- `valid` — `true` when `error_count == 0`

## Common errors caught

| Error | Example path |
|---|---|
| Missing required field | `#/paths/~1users/get/responses` |
| Invalid `$ref` | `#/components/schemas/User/properties/id` |
| Wrong type for parameter | `#/paths/~1items/get/parameters/0/schema` |
| Security scheme not defined | `#/paths/~1admin/get/security/0` |
| Response schema missing `type` | `#/paths/~1users/post/responses/200/content` |

## Example

```bash
# validate a spec file
asf query "validate my openapi spec at ./api/openapi.yaml"
```

```json
{
  "errors": [
    {
      "path": "#/paths/~1users/get/responses",
      "message": "Required property 'responses' is missing",
      "severity": "error"
    }
  ],
  "warnings": [],
  "error_count": 1,
  "valid": false
}
```

## Notes

- Supports OpenAPI 3.0.x, 3.1.x, and Swagger 2.0
- Use `strict: true` in CI pipelines to enforce documentation completeness
- YAML and JSON formats both supported; auto-detected from file extension
