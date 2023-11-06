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


  provisioner "file" {
    source      = "mycode.zip"
    destination = "~/mycode.zip"
  }

  provisioner "file" {
    source      = "cloud-watchconfig.json"
    destination = "/opt/aws/amazon-cloudwatch-agent/etc/cloud-watchconfig.json"
  }


  provisioner "shell" {
    inline = [
      "sudo groupadd csye6225",
      "sudo useradd -s /bin/false -g csye6225 -d /opt/csye6225 -m csye6225",
      "sudo apt update",
      "sudo mv mycode.zip /opt/csye6225/ ",
      "echo 'unzipping the file'",
      "cd /opt/csye6225/",
      "echo 'changing the permissions of script file and running the script'",
      "sudo apt install -y unzip",
      "sudo unzip mycode.zip -d .",
      "sudo chmod +x ./script.sh",
      "sudo chown -R csye6225:csye6225 /opt/csye6225",
      "sudo ./script.sh",
      "sudo apt remove git -y",
      "ls -al",
      "sudo mv myapp.service /etc/systemd/system/",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable myapp",
      "sudo systemctl start myapp",
      "curl https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb -o amazon-cloudwatch-agent.deb",
      "sudo dpkg -i -E ./amazon-cloudwatch-agent.deb",
      "sudo systemctl enable amazon-cloudwatch-agent",
      "sudo systemctl start amazon-cloudwatch-agent"

    ]





  }




}
