---
title: Terraform, Ansible, Kubernetes e automazione infrastrutturale
type: technical-guide
area: platform-engineering
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [terraform, ansible, kubernetes, iac, automation]
aliases: [Infrastructure as Code]
---

# Terraform, Ansible, Kubernetes e automazione infrastrutturale

## Principi

Automazione dichiarativa, review, piano prima dell’applicazione, ambienti separati, segreti esterni, stato protetto, moduli piccoli e rollback verificato.

## Terraform

```bash
terraform fmt -check -recursive
terraform init
terraform validate
terraform plan -out=tfplan
terraform show tfplan
terraform apply tfplan
terraform state list
terraform output
```

```hcl
variable "environment" {
  type        = string
  description = "Nome ambiente"
  validation {
    condition     = contains(["dev", "test", "prod"], var.environment)
    error_message = "Ambiente non valido."
  }
}
```

Proteggi backend e lock dello state; lo state può contenere segreti. Non usare `apply -auto-approve` in produzione senza gate.

## Ansible

```bash
ansible-inventory --graph
ansible all -m ping
ansible-playbook --syntax-check site.yml
ansible-playbook --check --diff site.yml
ansible-playbook site.yml --limit test
```

```yaml
- name: Configurazione idempotente
  hosts: app
  become: true
  tasks:
    - name: Pacchetto presente
      ansible.builtin.package:
        name: nginx
        state: present
```

Usa moduli idempotenti, Vault o secret manager, inventory distinti e handler.

## Kubernetes

```bash
kubectl config current-context
kubectl get pods -A
kubectl describe pod pod-name
kubectl logs pod-name --all-containers --tail=100
kubectl diff -f manifest.yaml
kubectl apply --server-side -f manifest.yaml
kubectl rollout status deployment/app
kubectl auth can-i --list
```

Imposta request/limit, probe, security context, RBAC minimo, NetworkPolicy, Pod Security, image digest e secret management. Verifica sempre cluster e namespace prima di modificare.

## Collegamenti

- [[Platform engineering CI CD e supply chain]]
- [[SRE osservabilita incidenti e continuita]]
- [[02_Cybersecurity/Cloud Container e DevSecOps/Baseline Kubernetes e supply chain|Sicurezza Kubernetes]]
