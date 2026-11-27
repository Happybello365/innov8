terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ---------------------------------------------------------------------------
# Locals
# ---------------------------------------------------------------------------

locals {
  enabled     = var.enable_cdn
  bucket_name = var.static_assets_bucket_name != "" ? var.static_assets_bucket_name : "${var.project_name}-${var.environment}-frontend-assets"

  # Origin IDs used in cache behaviours
  s3_origin_id = "s3-frontend-assets"
}

# ---------------------------------------------------------------------------
# S3 bucket — stores the Next.js static export / _next/static assets
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "assets" {
  count = local.enabled ? 1 : 0

  bucket        = local.bucket_name
  force_destroy = var.force_destroy_bucket

  tags = {
    Name        = local.bucket_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket_versioning" "assets" {
  count = local.enabled ? 1 : 0

  bucket = aws_s3_bucket.assets[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  count = local.enabled ? 1 : 0

  bucket = aws_s3_bucket.assets[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  count = local.enabled ? 1 : 0

  bucket = aws_s3_bucket.assets[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# Access log bucket (separate bucket so CloudFront can write to it)
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "logs" {
  count = local.enabled && var.enable_access_logs ? 1 : 0

  bucket        = "${local.bucket_name}-logs"
  force_destroy = var.force_destroy_bucket

  tags = {
    Name        = "${local.bucket_name}-logs"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  count = local.enabled && var.enable_access_logs ? 1 : 0

  bucket = aws_s3_bucket.logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  count = local.enabled && var.enable_access_logs ? 1 : 0

  bucket = aws_s3_bucket.logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  count = local.enabled && var.enable_access_logs ? 1 : 0

  bucket = aws_s3_bucket.logs[0].id

  rule {
    # CloudFront writes logs using the bucket-owner-full-control ACL; the
    # bucket owner delivery rule is required for that to succeed.
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  count = local.enabled && var.enable_access_logs ? 1 : 0

  bucket = aws_s3_bucket.logs[0].id

  rule {
    id     = "expire-cloudfront-logs"
    status = "Enabled"

    filter {
      prefix = var.log_prefix
    }

    expiration {
      days = var.log_retention_days
    }
  }
}

# ---------------------------------------------------------------------------
# Origin Access Control (OAC) — replaces the legacy OAI
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "assets" {
  count = local.enabled ? 1 : 0

  name                              = "${var.project_name}-${var.environment}-cdn-oac"
  description                       = "OAC for ${var.project_name} ${var.environment} frontend assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# S3 bucket policy — allow CloudFront service principal with OAC condition
resource "aws_s3_bucket_policy" "assets" {
  count = local.enabled ? 1 : 0

  bucket = aws_s3_bucket.assets[0].id
  policy = data.aws_iam_policy_document.assets_bucket[0].json

  depends_on = [aws_s3_bucket_public_access_block.assets]
}

data "aws_iam_policy_document" "assets_bucket" {
  count = local.enabled ? 1 : 0

  statement {
    sid    = "AllowCloudFrontOACGetObject"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets[0].arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend[0].arn]
    }
  }
}

# ---------------------------------------------------------------------------
# CloudFront Cache Policies
# ---------------------------------------------------------------------------

# Immutable policy — for _next/static/** (hashed filenames; safe to cache forever)
resource "aws_cloudfront_cache_policy" "immutable" {
  count = local.enabled ? 1 : 0

  name        = "${var.project_name}-${var.environment}-immutable-assets"
  comment     = "No-query / no-cookie; long TTL for hashed static assets"
  min_ttl     = var.min_ttl
  default_ttl = var.max_ttl
  max_ttl     = var.max_ttl

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# Default policy — for root / and non-hashed public files
resource "aws_cloudfront_cache_policy" "default_assets" {
  count = local.enabled ? 1 : 0

  name        = "${var.project_name}-${var.environment}-default-assets"
  comment     = "Standard TTL cache for public assets; no cookies forwarded"
  min_ttl     = var.min_ttl
  default_ttl = var.default_ttl
  max_ttl     = var.max_ttl

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# ---------------------------------------------------------------------------
# CloudFront Response Headers Policy
# Sets security headers and correct cache-control values on the response.
# ---------------------------------------------------------------------------

resource "aws_cloudfront_response_headers_policy" "security" {
  count = local.enabled ? 1 : 0

  name    = "${var.project_name}-${var.environment}-cdn-security-headers"
  comment = "Security and caching response headers for ${var.environment}"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_security_policy {
      # Tighten per-environment as needed; this is a safe starting baseline.
      content_security_policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.amanavault.com;"
      override                = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }

  custom_headers_config {
    items {
      # Ensures browsers revalidate after one day for root-level HTML
      header   = "Cache-Control"
      value    = "public, max-age=0, must-revalidate"
      override = false # do NOT override per-behaviour cache-control set below
    }
  }
}

# ---------------------------------------------------------------------------
# CloudFront Distribution
# ---------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "frontend" {
  count = local.enabled ? 1 : 0

  comment         = "${var.project_name} ${var.environment} frontend CDN"
  enabled         = true
  is_ipv6_enabled = true
  price_class     = var.price_class

  # Custom domains (optional)
  aliases = var.aliases

  # ACM certificate (required if aliases are set)
  dynamic "viewer_certificate" {
    for_each = var.acm_certificate_arn != "" ? [1] : []
    content {
      acm_certificate_arn      = var.acm_certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.acm_certificate_arn == "" ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  # WAF WebACL (optional)
  web_acl_id = var.enable_waf ? var.waf_web_acl_arn : null

  # -------------------------------------------------------------------------
  # S3 origin
  # -------------------------------------------------------------------------

  origin {
    domain_name              = aws_s3_bucket.assets[0].bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.assets[0].id
  }

  # -------------------------------------------------------------------------
  # Default cache behaviour — root & non-hashed public files
  # -------------------------------------------------------------------------

  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    cache_policy_id            = aws_cloudfront_cache_policy.default_assets[0].id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security[0].id

    compress = true

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.immutable_cache_headers[0].arn
    }
  }

  # -------------------------------------------------------------------------
  # Ordered cache behaviour — immutable hashed assets (_next/static/**)
  # Cache-Control: public, max-age=31536000, immutable
  # -------------------------------------------------------------------------

  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]

    cache_policy_id            = aws_cloudfront_cache_policy.immutable[0].id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security[0].id

    compress = true

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.immutable_cache_headers[0].arn
    }
  }

  # -------------------------------------------------------------------------
  # Access logging
  # -------------------------------------------------------------------------

  dynamic "logging_config" {
    for_each = var.enable_access_logs ? [1] : []
    content {
      bucket          = aws_s3_bucket.logs[0].bucket_domain_name
      prefix          = var.log_prefix
      include_cookies = false
    }
  }

  # -------------------------------------------------------------------------
  # Geo restriction (none by default)
  # -------------------------------------------------------------------------

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-cdn"
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  lifecycle {
    precondition {
      condition     = !var.enable_waf || var.waf_web_acl_arn != ""
      error_message = "waf_web_acl_arn must be set when enable_waf is true."
    }
  }
}

# ---------------------------------------------------------------------------
# CloudFront Function — sets immutable Cache-Control on _next/static responses
# ---------------------------------------------------------------------------

resource "aws_cloudfront_function" "immutable_cache_headers" {
  count = local.enabled ? 1 : 0

  name    = "${var.project_name}-${var.environment}-immutable-cache-headers"
  runtime = "cloudfront-js-2.0"
  comment = "Adds Cache-Control: public, max-age=31536000, immutable to _next/static responses"
  publish = true

  # The function checks whether the request path matches /_next/static/ and
  # sets the appropriate Cache-Control header.  For everything else it sets a
  # must-revalidate header so stale HTML is never served.
  code = <<-JS
    async function handler(event) {
      var response = event.response;
      var request  = event.request;
      var headers  = response.headers;

      if (request.uri.startsWith('/_next/static/')) {
        headers['cache-control'] = { value: 'public, max-age=31536000, immutable' };
      } else {
        // HTML and other root files: always revalidate
        if (!headers['cache-control']) {
          headers['cache-control'] = { value: 'public, max-age=0, must-revalidate' };
        }
      }

      return response;
    }
  JS
}
