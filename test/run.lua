-- Loads every Lua test suite and reports a compact TAP-style result stream.
local script = arg and arg[0] or "test/run.lua"
local root = script:match("^(.*)/test/run%.lua$") or "."
if root == "" then root = "." end

package.path = root .. "/src/?.lua;" .. root .. "/src/?/init.lua;"
    .. root .. "/test/?.lua;" .. package.path

local suites = {
    "unit.profile_test",
    "unit.paper_motion_test",
    "unit.profile_file_test",
    "unit.charset_test",
    "unit.json_test",
    "unit.encoder_test",
    "unit.parser_test",
    "unit.job_test",
    "unit.directive_alias_file_test",
    "unit.directive_whitespace_test",
    "unit.tabular_directive_test",
    "unit.paper_preview_test",
    "unit.directive_chain_test",
    "unit.discovery_test",
    "unit.printing_manifest_test",
    "unit.printing_routes_test",
    "unit.cli_parse_test",
    "unit.cli_output_test",
    "unit.cli_run_test",
    "unit.config_routing_test",
    "unit.config_files_test",
    "unit.config_validation_test",
    "unit.config_editor_test",
    "unit.terminal_state_test",
    "unit.editor_launcher_test",
    "unit.helper_process_test",
    "unit.setup_printing_test",
    "unit.printing_status_test",
    "unit.remove_printing_test",
    "unit.rules_test",
    "unit.main_test",
    "unit.input_resolver_test",
    "unit.raw_tcp_test",
    "unit.lpd_envelope_test",
    "unit.lpd_protocol_test",
    "unit.lpd_test",
    "unit.lpd_process_test",
    "unit.netcat_test",
    "unit.live.checkpoint_plan_test",
    "unit.live.live_raw_test",
    "unit.print_service_test",
    "integration.compiler_test",
    "integration.rule_test",
    "integration.tabular_test",
    "integration.code_page_directive_test",
    "integration.directive_alias_test",
    "integration.directive_chain_test",
    "integration.user_config_test",
    "integration.string_input_print_test",
    "integration.example_text_test",
}

local tests = {}
for _, module_name in ipairs(suites) do
    local suite = require(module_name)
    for _, test in ipairs(suite) do tests[#tests + 1] = test end
end

local failed = 0
for index, test in ipairs(tests) do
    local ok, err = pcall(test[2])
    if ok then
        io.write(string.format("ok %d - %s\n", index, test[1]))
    else
        failed = failed + 1
        io.write(string.format("not ok %d - %s\n  %s\n", index, test[1], tostring(err)))
    end
end
io.write(string.format("1..%d\n", #tests))

if failed > 0 then os.exit(1) end
