variable "project_name" {
  description = "Project name used as a prefix for all resource names."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev | staging | prod)."
  type        = string
}

# ---------------------------------------------------------------------------
# Feature flag — gate the entire CDN stack
# ---------------------------------------------------------------------------

variable "enable_cdn" {
  description = "When false the module creates no resources and all outputs are empty strings."
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# S3 origin
# ---------------------------------------------------------------------------

variable "static_assets_bucket_name" {
  description = <<-EOT
    Name for the S3 bucket that stores frontend static assets.
    Defaults to <project_name>-<environment>-frontend-assets.
  EOT
  type        = string
  default     = ""
}

variable "force_destroy_bucket" {
  description = "Allow Terraform to delete the S3 bucket even if it contains objects. Set false in prod."
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# ACM certificate (must be in us-east-1 for CloudFront)
# ---------------------------------------------------------------------------

variable "acm_certificate_arn" {
  description = <<-EOT
    ARN of an ACM certificate in us-east-1 for the CloudFront custom domain.
    Leave empty to use the default *.cloudfront.net domain.
  EOT
  type        = string
  default     = ""
}

variable "aliases" {
  description = "Alternate domain names (CNAMEs) for the CloudFront distribution, e.g. [\"cdn.amanavault.com\"]."
  type        = list(string)
  default     = []
}

# ---------------------------------------------------------------------------
# Cache behaviour tuning
# ---------------------------------------------------------------------------

variable "default_ttl" {
  description = "Default TTL in seconds for cacheable objects."
  type        = number
  default     = 86400 # 1 day
}

variable "min_ttl" {
  description = "Minimum TTL in seconds."
  type        = number
  default     = 0
}

variable "max_ttl" {
  description = "Maximum TTL in seconds."
  type        = number
  default     = 31536000 # 1 year
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_100 covers US/EU only and is cheapest."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be one of PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

# ---------------------------------------------------------------------------
# WAF toggle
# ---------------------------------------------------------------------------

variable "enable_waf" {
  description = <<-EOT
    Attach an existing WAFv2 WebACL (CLOUDFRONT scope) to the distribution.
    Requires waf_web_acl_arn to be set.
  EOT
  type        = bool
  default     = false
}

variable "waf_web_acl_arn" {
  description = "ARN of the WAFv2 WebACL to associate. Required when enable_waf = true."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

variable "enable_access_logs" {
  description = "Write CloudFront access logs to S3."
  type        = bool
  default     = true
}

variable "log_prefix" {
  description = "S3 key prefix for CloudFront access logs."
  type        = string
  default     = "cloudfront/"
}

variable "log_retention_days" {
  description = "Lifecycle expiry in days for access log objects."
  type        = number
  default     = 90
}
