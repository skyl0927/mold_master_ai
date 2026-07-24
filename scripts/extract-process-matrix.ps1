param(
    [Parameter(Mandatory = $true)]
    [string]$WorkbookPath,
    [string]$OutputDir = ".\data\generated"
)

$ErrorActionPreference = 'Stop'

function Normalize-Text {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) { return "" }

    $normalized = (($Value -replace "`r", " " -replace "`n", " ") -replace "\s+", " ").Trim()
    $dashOnly = ($normalized -replace '\s', '' -replace '-', '')

    if ([string]::IsNullOrWhiteSpace($dashOnly)) { return "" }
    return $normalized
}

function Split-CellItems {
    param([string]$Value)

    $normalized = Normalize-Text $Value
    if ([string]::IsNullOrWhiteSpace($normalized)) { return @() }

    # Keep one node per cell to avoid Excel/encoding-specific bullet parsing noise.
    return @($normalized)
}

function Add-Node {
    param(
        [hashtable]$NodeMap,
        [string]$Id,
        [string]$Label,
        [string]$Name,
        [hashtable]$Properties = @{}
    )

    if (-not $NodeMap.ContainsKey($Id)) {
        $NodeMap[$Id] = [ordered]@{
            id = $Id
            label = $Label
            name = $Name
            properties = $Properties
        }
    }
}

function Add-Edge {
    param(
        [System.Collections.ArrayList]$Edges,
        [string]$Source,
        [string]$Target,
        [string]$Relation,
        [hashtable]$Properties = @{}
    )

    $key = "$Source|$Relation|$Target"
    if (-not ($Edges | Where-Object { "$($_.source)|$($_.relation)|$($_.target)" -eq $key })) {
        [void]$Edges.Add([ordered]@{
            source = $Source
            target = $Target
            relation = $Relation
            properties = $Properties
        })
    }
}

if (-not (Test-Path $WorkbookPath)) {
    throw "Workbook not found: $WorkbookPath"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$records = New-Object System.Collections.ArrayList
$nodeMap = @{}
$edges = New-Object System.Collections.ArrayList

try {
    $wb = $excel.Workbooks.Open((Resolve-Path $WorkbookPath).Path)

    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -notlike 'Matrix(*') { continue }

        $productGroup = (($ws.Name -replace '^Matrix\(', '') -replace '\)\s*$', '').Trim()
        $used = $ws.UsedRange
        $level0 = ""
        $level1 = ""

        for ($r = 6; $r -le $used.Rows.Count; $r++) {
            $currentLevel0 = Normalize-Text $used.Item($r, 1).Text
            $currentLevel1 = Normalize-Text $used.Item($r, 2).Text
            $issueName = Normalize-Text $used.Item($r, 3).Text
            $designChecks = Normalize-Text $used.Item($r, 4).Text
            $machiningChecks = Normalize-Text $used.Item($r, 5).Text
            $assemblyChecks = Normalize-Text $used.Item($r, 6).Text
            $measurementChecks = Normalize-Text $used.Item($r, 7).Text
            $trialChecks = Normalize-Text $used.Item($r, 8).Text
            $commonActions = Normalize-Text $used.Item($r, 10).Text

            if ($currentLevel0) { $level0 = $currentLevel0 }
            if ($currentLevel1) { $level1 = $currentLevel1 }

            $hasContent = $issueName -or $designChecks -or $machiningChecks -or $assemblyChecks -or $measurementChecks -or $trialChecks -or $commonActions
            if (-not $hasContent) { continue }
            if (-not $issueName) { continue }

            $record = [ordered]@{
                sourceSheet = $ws.Name
                sourceRow = $r
                productGroup = $productGroup
                processGroup = $level0
                issueFamily = $level1
                issueName = $issueName
                designChecks = $designChecks
                machiningChecks = $machiningChecks
                assemblyChecks = $assemblyChecks
                measurementChecks = $measurementChecks
                trialChecks = $trialChecks
                commonActions = $commonActions
            }
            $record.rawJson = ($record | ConvertTo-Json -Depth 4 -Compress)
            [void]$records.Add($record)

            $productId = "product::$productGroup"
            $processId = "process::$productGroup::$level0"
            $familyId = "family::$productGroup::$level0::$level1"
            $issueId = "issue::$productGroup::$level0::$level1::$issueName"

            Add-Node -NodeMap $nodeMap -Id $productId -Label 'ProductGroup' -Name $productGroup -Properties @{ source_sheet = $ws.Name }
            Add-Node -NodeMap $nodeMap -Id $processId -Label 'ProcessGroup' -Name $level0 -Properties @{ product_group = $productGroup }
            Add-Node -NodeMap $nodeMap -Id $familyId -Label 'IssueFamily' -Name $level1 -Properties @{ product_group = $productGroup; process_group = $level0 }
            Add-Node -NodeMap $nodeMap -Id $issueId -Label 'Issue' -Name $issueName -Properties @{ product_group = $productGroup; process_group = $level0; issue_family = $level1 }

            Add-Edge -Edges $edges -Source $productId -Target $processId -Relation 'HAS_PROCESS_GROUP'
            Add-Edge -Edges $edges -Source $processId -Target $familyId -Relation 'HAS_ISSUE_FAMILY'
            Add-Edge -Edges $edges -Source $familyId -Target $issueId -Relation 'HAS_ISSUE'

            foreach ($entry in @(
                @{ stage = 'design'; value = $designChecks; relation = 'REQUIRES_DESIGN_CHECK' },
                @{ stage = 'machining'; value = $machiningChecks; relation = 'REQUIRES_MACHINING_CHECK' },
                @{ stage = 'assembly'; value = $assemblyChecks; relation = 'REQUIRES_ASSEMBLY_CHECK' },
                @{ stage = 'measurement'; value = $measurementChecks; relation = 'REQUIRES_MEASUREMENT_CHECK' },
                @{ stage = 'trial'; value = $trialChecks; relation = 'REQUIRES_TRIAL_CHECK' }
            )) {
                $index = 0
                foreach ($item in (Split-CellItems $entry.value)) {
                    $index += 1
                    $checkId = "check::$productGroup::$level0::$level1::$issueName::$($entry.stage)::$index"
                    Add-Node -NodeMap $nodeMap -Id $checkId -Label 'StageCheck' -Name $item -Properties @{ stage = $entry.stage; product_group = $productGroup }
                    Add-Edge -Edges $edges -Source $issueId -Target $checkId -Relation $entry.relation
                }
            }

            $commonIndex = 0
            foreach ($item in (Split-CellItems $commonActions)) {
                $commonIndex += 1
                $actionId = "action::$productGroup::$level0::$level1::$issueName::$commonIndex"
                Add-Node -NodeMap $nodeMap -Id $actionId -Label 'CommonAction' -Name $item -Properties @{ product_group = $productGroup }
                Add-Edge -Edges $edges -Source $issueId -Target $actionId -Relation 'RECOMMENDS_ACTION'
            }
        }
    }
}
finally {
    if ($wb) { $wb.Close($false) }
    $excel.Quit()
    if ($wb) { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb) | Out-Null }
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    [gc]::Collect()
    [gc]::WaitForPendingFinalizers()
}

$knowledgePath = Join-Path $OutputDir 'process-matrix-knowledge.json'
$graphPath = Join-Path $OutputDir 'process-matrix-graph-seed.json'

$records | ConvertTo-Json -Depth 6 | Set-Content -Path $knowledgePath -Encoding UTF8
([ordered]@{
    nodes = @($nodeMap.Values)
    edges = @($edges)
}) | ConvertTo-Json -Depth 8 | Set-Content -Path $graphPath -Encoding UTF8

Write-Output ("Knowledge records: {0}" -f $records.Count)
Write-Output ("Graph nodes: {0}" -f $nodeMap.Count)
Write-Output ("Graph edges: {0}" -f $edges.Count)
Write-Output ("Knowledge JSON: {0}" -f (Resolve-Path $knowledgePath).Path)
Write-Output ("Graph JSON: {0}" -f (Resolve-Path $graphPath).Path)
