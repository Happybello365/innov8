# All outputs are empty strings when enable_cdn = false so callers can always
# reference them without conditional logic.

output "distribution_id" {
  description = "CloudFront distribution ID. Empty string when enable_cdn = false."
  value       = length(aws_cloudfront_distribution.frontend) > 0 ? aws_cloudfront_distribution.frontend[0].id : ""
}

output "distribution_arn" {
  description = "CloudFront distribution ARN. Empty string when enable_cdn = false."
  value       = length(aws_cloudfront_distribution.frontend) > 0 ? aws_cloudfront_distribution.frontend[0].arn : ""
}

output "distribution_domain_name" {
  description = "Default CloudFront domain name (*.cloudfront.net). Empty string when enable_cdn = false."
  value       = length(aws_cloudfront_distribution.frontend) > 0 ? aws_cloudfront_distribution.frontend[0].domain_name : ""
}

output "distribution_hosted_zone_id" {
  description = "CloudFront hosted zone ID for use in Route 53 alias records. Empty string when enable_cdn = false."
  value       = length(aws_cloudfront_distribution.frontend) > 0 ? aws_cloudfront_distribution.frontend[0].hosted_zone_id : ""
}

output "assets_bucket_id" {
  description = "ID of the S3 bucket holding frontend static assets. Empty string when enable_cdn = false."
  value       = length(aws_s3_bucket.assets) > 0 ? aws_s3_bucket.assets[0].id : ""
}

output "assets_bucket_arn" {
  description = "ARN of the S3 assets bucket. Empty string when enable_cdn = false."
  value       = length(aws_s3_bucket.assets) > 0 ? aws_s3_bucket.assets[0].arn : ""
}

output "assets_bucket_regional_domain_name" {
  description = "Regional domain name of the S3 assets bucket. Empty string when enable_cdn = false."
  value       = length(aws_s3_bucket.assets) > 0 ? aws_s3_bucket.assets[0].bucket_regional_domain_name : ""
}

output "oac_id" {
  description = "ID of the CloudFront Origin Access Control. Empty string when enable_cdn = false."
  value       = length(aws_cloudfront_origin_access_control.assets) > 0 ? aws_cloudfront_origin_access_control.assets[0].id : ""
}

output "logs_bucket_id" {
  description = "ID of the CloudFront access logs bucket. Empty string when enable_cdn = false or enable_access_logs = false."
  value       = length(aws_s3_bucket.logs) > 0 ? aws_s3_bucket.logs[0].id : ""
}
