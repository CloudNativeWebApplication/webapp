packer {
  required_plugins {
    amazon = {
      source  = "github.com/hashicorp/amazon"
      version = "~> 1"
    }
  }
}

variable "demo_account_id" {
  type        = string
  description = "this is the demo accout id "
}

variable "source_ami" {
  type        = string
  description = "The source AMI ID to use as a base"
}


variable "aws_region" {
  type        = string
  description = "The aws region ID to use"
}

variable "aws_access_key" {
  type        = string
  description = "AWS access key"
}

variable "aws_secret_access_key" {
  type        = string
  description = "AWS secret key"
}



source "amazon-ebs" "custom" {
  ami_name      = "Assignment5AMI_${formatdate("YYYY_MM_DD_hh_mm_ss", timestamp())}"
  source_ami    = var.source_ami
  instance_type = "t2.micro"
  ssh_username  = "admin"
  region        = var.aws_region

  access_key = var.aws_access_key
  secret_key = var.aws_secret_access_key


  ami_users = [var.demo_account_id]

}


build {
  sources = ["source.amazon-ebs.custom"]

  provisioner "shell" {
    inline = [
      "echo 'Customization steps here'",
      "sudo apt-get update",
      "echo 'Additional customization steps here'",
      "sudo apt install -y zip"
    ]
  }

  provisioner "file" {
    source      = "mycode.zip"
    destination = "~/mycode.zip"
  }


  provisioner "shell" {
    inline = [
      "sudo apt update",
      "sudo apt install -y nodejs npm unzip",
      "unzip mycode.zip",
      "sudo chown -R csye6225:csye6225 /opt/csye6225",
    ]
  }

  provisioner "shell" {
    inline = [
      "sudo su - csye6225 -c 'cd /opt/csye6225 && npm install'",
      "sudo su - csye6225 -c 'cd /opt/csye6225 && npm uninstall bcrypt'",
      "sudo su - csye6225 -c 'cd /opt/csye6225 && npm install bcrypt'",
    ]
  }

  provisioner "shell" {
    inline = [
      "sudo apt remove git -y",
      "sudo mv myapp.service /etc/systemd/system/",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable myapp.service",
      "sudo systemctl start myapp.service",
    ]
  }



}
