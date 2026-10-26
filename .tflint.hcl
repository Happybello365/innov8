plugin "aws" {
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
  version = "0.32.0"
  enabled = true
}

rule "terraform_required_version" {
  enabled = false # modules intentionally omit required_version; controlled at environment level
}

rule "terraform_module_pinned_source" {
  enabled = true
  style   = "flexible"
}

rule "terraform_naming_convention" {
  enabled = true
}

rule "terraform_documented_variables" {
  enabled = true
}

rule "terraform_documented_outputs" {
  enabled = true
}
