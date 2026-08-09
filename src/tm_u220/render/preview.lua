local diagnostics = require("tm_u220.core.diagnostics")

local M = {}

local function profile_heading(profile)
    return string.format(
        "TM-U220 Type %s, %s paper, DIP 2-1 %s, %d default Font B columns",
        profile.variant:upper(),
        profile.paper_id,
        profile.dip2_1 and "on" or "off",
        profile.columns.b
    )
end

local function markers(line)
    local values = {}
    if line.justification ~= "left" then values[#values + 1] = line.justification end
    local seen = {}
    for _, segment in ipairs(line.segments or {}) do
        local style = segment.style or {}
        for _, entry in ipairs({
            { "font-a", style.font == "a" },
            { "emphasis", style.emphasis },
            { "double-strike", style.double_strike },
            { "double-width", style.double_width },
            { "double-height", style.double_height },
            { "underline", style.underline and style.underline ~= "off" },
            { "red", style.color == "red" },
            { "upside-down", style.upside_down },
        }) do
            if entry[2] and not seen[entry[1]] then
                seen[entry[1]] = true
                values[#values + 1] = entry[1]
            end
        end
    end
    return #values > 0 and "  [" .. table.concat(values, ", ") .. "]" or ""
end

local function finish_line(finish)
    local parts = {}
    if finish.feed_lines > 0 then
        parts[#parts + 1] = string.format(
            "feed %d logical line%s",
            finish.feed_lines,
            finish.feed_lines == 1 and "" or "s"
        )
    end
    parts[#parts + 1] = "advance to cutter position"
    if finish.feed_units > 0 then
        parts[#parts + 1] = string.format(
            "%d extra 1/144-inch unit%s",
            finish.feed_units,
            finish.feed_units == 1 and "" or "s"
        )
    end
    parts[#parts + 1] = finish.cut_shape .. " cut"
    return "Finish: " .. table.concat(parts, "; ")
end

function M.format_line(index, line)
    if line.kind == "image" then
        local segment = line.segments and line.segments[1] or {}
        return string.format("%03d | [image %s, %dx%d dots, %s]%s", index,
            tostring(line.image_label or "image"), segment.mask_width_dots or 0,
            segment.mask_height_dots or 0, tostring(line.image_density or "solid"),
            markers(line))
    end
    return string.format("%03d | %s%s", index, line.text, markers(line))
end

function M.render(result)
    local out = { profile_heading(result.profile), "" }
    for index, line in ipairs(result.preview_lines or {}) do
        out[#out + 1] = M.format_line(index, line)
    end
    if result.finish then
        out[#out + 1] = ""
        out[#out + 1] = finish_line(result.finish)
    end
    if #(result.diagnostics or {}) > 0 then
        out[#out + 1] = ""
        out[#out + 1] = "Diagnostics"
        for _, item in ipairs(result.diagnostics) do
            out[#out + 1] = "  " .. diagnostics.format(item)
        end
    end
    return table.concat(out, "\n") .. "\n"
end

return M
