variable "name" {
  type    = string
  default = "vellum-database"
}

output "name" {
  value = var.name
}
