"""Artifacts, samples and fragments."""

from __future__ import annotations

import io
import json

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from fastapi.responses import FileResponse

from ... import samples as sample_lib
from ...core.errors import InvalidInput
from ...schemas import ArtifactOut, FragmentDetail, FragmentOut, FragmentParams, SampleArtifactCreate, SampleInfo
from ...services import ArtifactService, FragmentSpec, LocalStorage
from ..deps import artifact_service, get_storage
from ..presenters import API, artifact_out, fragment_out

router = APIRouter(tags=["artifacts"])


@router.get("/samples", response_model=list[SampleInfo])
def list_samples():
    return [
        SampleInfo(name=k, description=v, image_url=f"{API}/samples/{k}/image") for k, v in sample_lib.SAMPLES.items()
    ]


@router.get("/samples/{name}/image", response_class=Response, responses={200: {"content": {"image/png": {}}}})
def sample_image(name: str):
    if name not in sample_lib.SAMPLES:
        raise InvalidInput(f"unknown sample {name!r}")
    buf = io.BytesIO()
    sample_lib.make_sample(name).save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/artifacts", response_model=list[ArtifactOut])
def list_artifacts(
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), svc: ArtifactService = Depends(artifact_service)
):
    return [artifact_out(a) for a in svc.list(limit, offset)]


@router.post("/artifacts/sample", response_model=ArtifactOut, status_code=status.HTTP_201_CREATED)
def create_from_sample(body: SampleArtifactCreate, svc: ArtifactService = Depends(artifact_service)):
    art = svc.create_from_sample(body.name, body.sample, FragmentSpec(**body.fragment.model_dump()), body.description)
    return artifact_out(art)


@router.post("/artifacts/upload", response_model=ArtifactOut, status_code=status.HTTP_201_CREATED)
async def create_from_upload(
    name: str = Form(..., min_length=1, max_length=120),
    image: UploadFile = File(...),
    params: str = Form("{}", description="FragmentParams as JSON"),
    description: str | None = Form(None),
    svc: ArtifactService = Depends(artifact_service),
):
    spec = FragmentParams.model_validate(json.loads(params or "{}"))
    data = await image.read()
    return artifact_out(svc.create_from_upload(name, data, FragmentSpec(**spec.model_dump()), description))


@router.post("/artifacts/fragments-upload", response_model=ArtifactOut, status_code=status.HTTP_201_CREATED)
async def create_from_fragments(
    name: str = Form(..., min_length=1, max_length=120),
    rows: int = Form(..., ge=1, le=8),
    cols: int = Form(..., ge=1, le=8),
    files: list[UploadFile] = File(...),
    svc: ArtifactService = Depends(artifact_service),
):
    blobs = [await f.read() for f in files]
    return artifact_out(svc.create_from_fragments(name, blobs, rows, cols))


@router.get("/artifacts/{artifact_id}", response_model=ArtifactOut)
def get_artifact(artifact_id: str, svc: ArtifactService = Depends(artifact_service)):
    return artifact_out(svc.get(artifact_id))


@router.delete("/artifacts/{artifact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_artifact(artifact_id: str, svc: ArtifactService = Depends(artifact_service)):
    svc.delete(artifact_id)
    return Response(status_code=204)


@router.get("/artifacts/{artifact_id}/image", response_class=FileResponse)
def artifact_image(
    artifact_id: str, svc: ArtifactService = Depends(artifact_service), storage: LocalStorage = Depends(get_storage)
):
    art = svc.get(artifact_id)
    if not art.source_path:
        raise InvalidInput("artifact has no source image")
    return FileResponse(storage.path(art.source_path), media_type="image/png")


@router.post("/artifacts/{artifact_id}/fragment", response_model=list[FragmentOut])
def refragment(artifact_id: str, body: FragmentParams, svc: ArtifactService = Depends(artifact_service)):
    art = svc.get(artifact_id)
    return [fragment_out(f) for f in svc.fragment(art, FragmentSpec(**body.model_dump()))]


@router.get("/artifacts/{artifact_id}/fragments", response_model=list[FragmentOut])
def list_fragments(artifact_id: str, svc: ArtifactService = Depends(artifact_service)):
    svc.get(artifact_id)
    return [fragment_out(f) for f in svc.fragments.list_for(artifact_id)]


@router.get("/fragments/{fragment_id}", response_model=FragmentDetail)
def get_fragment(fragment_id: str, svc: ArtifactService = Depends(artifact_service)):
    return fragment_out(svc.fragments.get(fragment_id), detail=True)


@router.get("/fragments/{fragment_id}/image", response_class=FileResponse)
def fragment_image_file(
    fragment_id: str, svc: ArtifactService = Depends(artifact_service), storage: LocalStorage = Depends(get_storage)
):
    frag = svc.fragments.get(fragment_id)
    return FileResponse(
        storage.path(frag.image_path), media_type="image/png", headers={"Cache-Control": "max-age=3600"}
    )
