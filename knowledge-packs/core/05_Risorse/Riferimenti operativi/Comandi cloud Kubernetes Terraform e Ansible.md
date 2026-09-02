---
title: Comandi cloud, Kubernetes, Terraform e Ansible
type: command-reference
area: cloud-platform
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-07-29
source_kind: curated
tags: [aws, azure, gcp, kubernetes, terraform, ansible, commands]
aliases: [Comandi cloud e Kubernetes]
---

# Comandi cloud, Kubernetes, Terraform e Ansible

## Contesto prima dell’azione

```bash
aws sts get-caller-identity
az account show --output table
gcloud auth list
gcloud config list
kubectl config current-context
kubectl config view --minify
terraform workspace show
ansible-inventory --graph
```

Annota account, role, subscription/project, region, cluster, namespace e workspace. Non assumere che il prompt della shell rifletta il contesto reale.

## AWS read-only

```bash
aws configure list
aws ec2 describe-regions
aws ec2 describe-instances --output table
aws s3api list-buckets
aws iam get-account-summary
aws cloudtrail describe-trails
aws logs describe-log-groups
```

Usa query JMESPath per minimizzare output:

```bash
aws ec2 describe-instances \
  --query 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,Type:InstanceType}'
```

## Azure read-only

```bash
az account list --output table
az group list --output table
az resource list --output table
az vm list -d --output table
az role assignment list --all --output table
az monitor activity-log list --offset 4h
```

## GCP read-only

```bash
gcloud projects list
gcloud compute instances list
gcloud storage buckets list
gcloud projects get-iam-policy PROJECT_ID
gcloud logging read 'timestamp>=\"2026-01-01T00:00:00Z\"' --limit=50
```

## Kubernetes

```bash
kubectl get namespaces
kubectl get workloads -A
kubectl get pods -A -o wide
kubectl describe pod POD -n NAMESPACE
kubectl logs POD -n NAMESPACE --all-containers --tail=100
kubectl get events -A --sort-by=.metadata.creationTimestamp
kubectl top nodes
kubectl top pods -A
kubectl auth can-i --list -n NAMESPACE
kubectl diff -f manifests/
kubectl rollout status deployment/APP -n NAMESPACE
```

Non usare `--force`, delete o scale su produzione senza change e rollback.

## Helm

```bash
helm list -A
helm status RELEASE -n NAMESPACE
helm get values RELEASE -n NAMESPACE
helm get manifest RELEASE -n NAMESPACE
helm lint chart/
helm template RELEASE chart/ -f values.yaml
helm diff upgrade RELEASE chart/ -f values.yaml
```

## Terraform

```bash
terraform fmt -check -recursive
terraform init
terraform validate
terraform workspace show
terraform plan -out=tfplan
terraform show -no-color tfplan > plan.txt
terraform state list
terraform providers
```

Lo state è sensibile. Non pubblicarlo né modificarlo manualmente. Applica soltanto il file plan revisionato.

## Ansible

```bash
ansible --version
ansible-inventory --list
ansible all -m ping
ansible-playbook --syntax-check site.yml
ansible-playbook --check --diff site.yml
ansible-playbook site.yml --limit test --step
ansible-vault view group_vars/all/vault.yml
```

Non mostrare contenuti Vault in log o registrazioni.

## Container

```bash
docker context show
docker ps
docker inspect CONTAINER
docker stats --no-stream
docker logs --tail 100 CONTAINER
docker image inspect IMAGE
docker history --no-trunc IMAGE
```

## Evidenze cloud

Esporta configurazioni read-only in una directory protetta, conserva identità del caller, timestamp, regione e checksum. Le policy possono contenere nomi sensibili.

## Collegamenti

- [[01_Informatica/Cloud SRE e Platform/AWS Azure GCP servizi identita rete e operazioni|AWS, Azure e GCP]]
- [[01_Informatica/Cloud SRE e Platform/Terraform Ansible Kubernetes e automazione infrastrutturale|Infrastructure as Code]]
- [[Comandi Docker e Compose]]
