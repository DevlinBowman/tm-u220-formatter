-- Presents the complete, path-free API for versioned image-interpretation profiles.
-- Callers can validate effective values or parse and serialize profile text without importing internals.
local File = require("tm_u220.printhead.image_profile.file")
local Model = require("tm_u220.printhead.image_profile.model")

return {
    VERSION = Model.VERSION,
    HEADER = File.HEADER,
    is = Model.is,
    new = Model.new,
    defaults = Model.defaults,
    parse = File.parse,
    serialize = File.serialize,
}
