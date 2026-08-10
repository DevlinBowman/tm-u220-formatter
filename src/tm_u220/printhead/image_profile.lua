-- Presents the complete, path-free API for versioned image-interpretation profiles.
-- Safe copies expose effective options and editor schema without leaking internal model state.
local File = require("tm_u220.printhead.image_profile.file")
local Model = require("tm_u220.printhead.image_profile.model")
local Schema = require("tm_u220.printhead.image_profile.schema")

return {
    VERSION = Model.VERSION,
    HEADER = File.HEADER,
    is = Model.is,
    new = Model.new,
    defaults = Model.defaults,
    options = Model.options,
    schema = Schema.describe,
    parse = File.parse,
    serialize = File.serialize,
}
