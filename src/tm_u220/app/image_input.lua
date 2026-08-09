-- Recognizes supported image bytes and normalizes direct files into one image-only document.
-- It contains no decoding or filesystem policy; those remain in the image asset pipeline.
local M = {}
local PNG_SIGNATURE = "\137PNG\r\n\26\n"

function M.detect(value)
    if type(value) ~= "string" then return nil end
    if value:sub(1, #PNG_SIGNATURE) == PNG_SIGNATURE then return "png" end
    local third = value:byte(3)
    if value:sub(1, 2) == "P4"
        and (third == 35 or third == 32 or (third and third >= 9 and third <= 13)) then
        return "pbm"
    end
end

function M.reference(path)
    if type(path) ~= "string" or path == "" or path == "-" then return nil end
    local normalized = path:gsub("\\", "/"):gsub("/+$", "")
    local name = normalized:match("([^/]+)$")
    return name ~= "" and name or nil
end

function M.document(resolved)
    return {
        version = 1,
        profile = {},
        diagnostics = {},
        ops = { {
            kind = "image",
            path = resolved.image_reference,
            image_format = resolved.image_format,
            direct_image = true,
        } },
    }
end

return M
