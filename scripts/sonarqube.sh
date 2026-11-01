#!/bin/bash
# Installs SonarQube 25.3 + PostgreSQL on an Ubuntu EC2 instance.
# Usage: SONAR_PASS='a-strong-password' ./sonarqube.sh

set -e

SONAR_VERSION="25.3.0.104237"
SONAR_USER="sonar"
SONAR_DB="sonarqube"
SONAR_PASS="${SONAR_PASS:?Set SONAR_PASS before running this script}"

echo "Installing SonarQube ${SONAR_VERSION}"

sudo apt update
sudo apt install -y openjdk-17-jdk wget unzip curl postgresql postgresql-contrib

sudo systemctl enable postgresql
sudo systemctl start postgresql

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$SONAR_USER'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE USER $SONAR_USER WITH PASSWORD '$SONAR_PASS';"

sudo -u postgres psql -lqt | cut -d \| -f1 | grep -qw "$SONAR_DB" || \
sudo -u postgres createdb -O $SONAR_USER $SONAR_DB

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $SONAR_DB TO $SONAR_USER;"

cd /opt
sudo rm -rf sonarqube sonarqube.zip

sudo wget -O sonarqube.zip \
  "https://binaries.sonarsource.com/Distribution/sonarqube/sonarqube-${SONAR_VERSION}.zip"
sudo unzip -q sonarqube.zip
sudo mv sonarqube-* sonarqube

id -u sonar >/dev/null 2>&1 || sudo useradd -r -m -U -d /opt/sonarqube sonar
sudo chown -R sonar:sonar /opt/sonarqube

sudo tee /opt/sonarqube/conf/sonar.properties >/dev/null <<EOF
sonar.jdbc.username=$SONAR_USER
sonar.jdbc.password=$SONAR_PASS
sonar.jdbc.url=jdbc:postgresql://localhost:5432/$SONAR_DB
EOF

echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-sonarqube.conf
echo "fs.file-max=65536" | sudo tee -a /etc/sysctl.d/99-sonarqube.conf
sudo sysctl --system

sudo tee /etc/systemd/system/sonarqube.service >/dev/null <<EOF
[Unit]
Description=SonarQube
After=network.target postgresql.service

[Service]
Type=forking
User=sonar
Group=sonar
ExecStart=/opt/sonarqube/bin/linux-x86-64/sonar.sh start
ExecStop=/opt/sonarqube/bin/linux-x86-64/sonar.sh stop
Restart=always
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable sonarqube
sudo systemctl restart sonarqube

echo "Done. Open http://<EC2_PUBLIC_IP>:9000 (default login admin/admin, change it immediately)."
